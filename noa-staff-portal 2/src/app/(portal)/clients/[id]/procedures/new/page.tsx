'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Header from '@/components/ui/Header'
import { createClient } from '@/lib/supabase/client'

interface StepDraft {
  heading: string
  content: string
  note: string
}

export default function NewProcedurePage() {
  const router = useRouter()
  const params = useParams()
  const clientId = params.id as string
  const supabase = createClient()

  const [title, setTitle] = useState('')
  const [steps, setSteps] = useState<StepDraft[]>([
    { heading: '', content: '', note: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addStep = () => {
    setSteps([...steps, { heading: '', content: '', note: '' }])
  }

  const removeStep = (idx: number) => {
    if (steps.length <= 1) return
    setSteps(steps.filter((_, i) => i !== idx))
  }

  const updateStep = (idx: number, field: keyof StepDraft, value: string) => {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s)))
  }

  const handleSave = async (submitForApproval: boolean) => {
    if (!title.trim()) {
      setError('タイトルを入力してください')
      return
    }
    if (steps.some((s) => !s.heading.trim() || !s.content.trim())) {
      setError('すべてのステップの項目とサービス内容を入力してください')
      return
    }

    setSaving(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Create procedure
      const { data: proc, error: procErr } = await supabase
        .from('procedures')
        .insert({
          client_id: clientId,
          title: title.trim(),
          status: submitForApproval ? 'pending' : 'draft',
          created_by: user.id,
        })
        .select()
        .single()

      if (procErr || !proc) throw procErr

      // Create steps
      const { error: stepsErr } = await supabase
        .from('procedure_items')
        .insert(
          steps.map((s, i) => ({
            procedure_id: proc.id,
            sort_order: i,
            heading: s.heading.trim(),
            content: s.content.trim(),
            note: s.note.trim() || null,
          }))
        )

      if (stepsErr) throw stepsErr

      // If submitting for approval, create approval request & send LINE notify
      if (submitForApproval) {
        // Find a coordinator to assign
        const { data: coordinators } = await supabase
          .from('profiles')
          .select('id, line_user_id')
          .in('role', ['coordinator', 'admin'])
          .eq('is_active', true)
          .limit(1)

        if (coordinators && coordinators.length > 0) {
          await supabase.from('approval_requests').insert({
            procedure_id: proc.id,
            requested_by: user.id,
            assigned_to: coordinators[0].id,
          })

          // Send LINE notification
          try {
            await fetch('/api/line-notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                procedureId: proc.id,
                procedureTitle: title.trim(),
                clientId,
              }),
            })
          } catch (e) {
            console.error('LINE notify failed:', e)
          }
        }
      }

      router.push(`/clients/${clientId}`)
      router.refresh()
    } catch (e: any) {
      setError(e?.message || '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Header title="手順書を作成" showBack />

      <div className="p-4 pb-32">
        {/* Title */}
        <label className="block text-xs font-bold text-gray-500 mb-1.5">手順書タイトル</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例：入浴介助、調理支援"
          className="input-field mb-5"
        />

        {/* Steps */}
        {steps.map((step, i) => (
          <div key={i} className="card mb-3 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-primary-light border-b border-primary-mid">
              <span className="w-[26px] h-[26px] rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <span className="text-sm font-bold text-primary-dark flex-1">ステップ {i + 1}</span>
              {steps.length > 1 && (
                <button
                  onClick={() => removeStep(i)}
                  className="text-red-400 text-xs font-semibold px-2 py-1 rounded active:bg-red-50"
                >
                  削除
                </button>
              )}
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">項目（見出し）</label>
                <input
                  type="text"
                  value={step.heading}
                  onChange={(e) => updateStep(i, 'heading', e.target.value)}
                  placeholder="例：バイタル確認"
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">サービス内容と手順</label>
                <textarea
                  value={step.content}
                  onChange={(e) => updateStep(i, 'content', e.target.value)}
                  placeholder="具体的な手順を記入してください"
                  rows={3}
                  className="input-field resize-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">留意事項（任意）</label>
                <textarea
                  value={step.note}
                  onChange={(e) => updateStep(i, 'note', e.target.value)}
                  placeholder="特に注意すべき点があれば記入"
                  rows={2}
                  className="input-field resize-none"
                />
              </div>
            </div>
          </div>
        ))}

        {/* Add step button */}
        <button
          onClick={addStep}
          className="w-full card flex items-center justify-center gap-2 px-4 py-3 text-primary font-semibold text-sm active:scale-[0.98] transition-transform border-dashed border-primary mb-5"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          ステップを追加
        </button>

        {/* Error */}
        {error && (
          <div className="text-red-500 text-sm bg-red-50 px-4 py-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex-1 btn-outline disabled:opacity-50"
          >
            下書き保存
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="flex-1 btn-primary disabled:opacity-50"
          >
            {saving ? '送信中...' : '承認依頼'}
          </button>
        </div>
      </div>
    </>
  )
}
