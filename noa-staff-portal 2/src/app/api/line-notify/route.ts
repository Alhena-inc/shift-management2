import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notifyProcedureSubmission, notifyProcedureResult } from '@/lib/line/notify'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Case 1: New procedure submission → notify coordinator
    if (body.procedureId && !body.approvalId) {
      const { data: procedure } = await supabase
        .from('procedures')
        .select('*, clients:client_id(name)')
        .eq('id', body.procedureId)
        .single()

      if (!procedure) {
        return NextResponse.json({ error: 'Procedure not found' }, { status: 404 })
      }

      const { data: creator } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single()

      // Find coordinators with LINE IDs
      const { data: coordinators } = await supabase
        .from('profiles')
        .select('line_user_id')
        .in('role', ['coordinator', 'admin'])
        .eq('is_active', true)
        .not('line_user_id', 'is', null)

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''

      for (const coord of coordinators || []) {
        if (coord.line_user_id) {
          await notifyProcedureSubmission({
            coordinatorLineId: coord.line_user_id,
            procedureTitle: procedure.title,
            clientName: (procedure as any).clients?.name || '',
            authorName: creator?.display_name || 'スタッフ',
            procedureUrl: `${appUrl}/approvals`,
          })
        }
      }

      // Mark as notified
      await supabase
        .from('approval_requests')
        .update({ line_notified: true, line_notified_at: new Date().toISOString() })
        .eq('procedure_id', body.procedureId)
        .eq('status', 'pending')

      return NextResponse.json({ success: true })
    }

    // Case 2: Approval/rejection result → notify creator
    if (body.approvalId && body.action) {
      const { data: approval } = await supabase
        .from('approval_requests')
        .select(`
          *,
          procedures:procedure_id(
            *,
            clients:client_id(name),
            creator:created_by(display_name, line_user_id)
          )
        `)
        .eq('id', body.approvalId)
        .single()

      if (!approval) {
        return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
      }

      const proc = (approval as any).procedures
      const creator = proc?.creator
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''

      if (creator?.line_user_id) {
        await notifyProcedureResult({
          helperLineId: creator.line_user_id,
          procedureTitle: proc.title,
          clientName: proc.clients?.name || '',
          approved: body.action === 'approved',
          reason: body.reason,
          procedureUrl: `${appUrl}/clients/${proc.client_id}`,
        })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  } catch (error: any) {
    console.error('LINE notify error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
