import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// CSV column mapping: CSV header → DB column
const COLUMN_MAP: Record<string, string> = {
  '氏名': 'name',
  'フリガナ': 'furigana',
  '生年月日': 'birth_date',
  '年齢': 'age',
  '性別': 'gender',
  '住所': 'address',
  '電話番号': 'phone',
  'FAX番号': 'fax',
  '住居形態': 'housing_type',
  '障がい種別': 'disability_type',
  '等級': 'disability_grade',
  '疾患名': 'disease_name',
  '障害支援区分': 'support_category',
  'サービス種別': 'service_type',
  '家族構成': 'family_structure',
  '主たる介護者': 'primary_caregiver',
  '社会関係': 'social_relations',
  '本人の希望': 'client_wishes',
  '家族の希望': 'family_wishes',
  '希望する暮らし（本人）': 'desired_living',
  '希望する暮らし（家族）': 'family_desired_living',
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"(.*)"$/, '$1'))
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/^"(.*)"$/, '$1'))
    const row: Record<string, string> = {}
    headers.forEach((h, j) => {
      const dbCol = COLUMN_MAP[h]
      if (dbCol && values[j]) {
        row[dbCol] = values[j]
      }
    })
    if (row.name) rows.push(row)
  }

  return rows
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role === 'helper') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const text = await file.text()
    const rows = parseCSV(text)

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid rows found' }, { status: 400 })
    }

    // Convert age to number
    const clientData = rows.map((row) => ({
      ...row,
      age: row.age ? parseInt(row.age, 10) : null,
    }))

    const { data, error } = await supabase
      .from('clients')
      .upsert(clientData, { onConflict: 'name' })
      .select()

    if (error) throw error

    return NextResponse.json({
      success: true,
      imported: data?.length || 0,
      total: rows.length,
    })
  } catch (error: any) {
    console.error('CSV import error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
