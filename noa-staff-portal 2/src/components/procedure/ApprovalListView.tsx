'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/ui/Header'
import { createClient } from '@/lib/supabase/client'

interface Props {
  requests: any[]
  userId: string
}

export default function ApprovalListView({ requests, userId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const handleApprove = async (requestId: string, procedureId: string) => {
    setProcessing(requestId)
    try {
      // Update approval request
      await supabase
        .from('approval_requests')
        .update({ status: 'approved', responded_at: new Date().toISOString() })
        .eq('id', requestId)

      // Update procedure status
      await supabase
        .from('procedures')
        .update({
          status: 'approved',
          approved_by: userId,
          approved_at: new Date().toISOString(),
        })
        .eq('id', procedureId)

      // Send LINE notification to creator
      try {
        await fetch('/api/line-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvalId: requestId, action: 'approved' }),
        })
      } catch {}

      router.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (requestId: string, procedureId: string) => {
    if (!rejectReason.trim()) return
    setProcessing(requestId)
    try {
      await supabase
        .from('approval_requests')
        .update({ status: 'rejected', responded_at: new Date().toISOString() })
        .eq('id', requestId)

      await supabase
        .from('procedures')
        .update({ status: 'rejected', rejection_reason: rejectReason.trim() })
        .eq('id', procedureId)

      try {
        await fetch('/api/line-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvalId: requestId, action: 'rejected', reason: rejectReason.trim() }),
        })
      } catch {}

      setRejectId(null)
      setRejectReason('')
      router.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setProcessing(null)
    }
  }

  return (
    <>
      <Header title="承認待ち一覧" showBack />

      <div className="p-4 pb-24">
        {requests.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">✅</div>
            <div className="text-sm">承認待ちの手順書はありません</div>
          </div>
        ) : (
          requests.map((req) => {
            const proc = req.procedures
            if (!proc) return null

            return (
              <div key={req.id} className="card mb-3 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3.5 border-b border-gray-100">
                  <div className="text-[15px] font-semibold mb-1">
                    📖 {proc.title}
                  </div>
                  <div className="text-xs text-gray-500 flex gap-3 flex-wrap">
                    <span>利用者: {proc.clients?.name}</span>
                    <span>作成者: {proc.creator?.display_name}</span>
                  </div>
                </div>

                {/* Steps preview */}
                <div className="px-4 py-3 bg-gray-50">
                  <div className="text-[11px] font-bold text-gray-500 mb-2">手順（{proc.procedure_items?.length || 0}ステップ）</div>
                  {(proc.procedure_items || [])
                    .sort((a: any, b: any) => a.sort_order - b.sort_order)
                    .map((item: any, i: number) => (
                      <div key={item.id} className="flex items-start gap-2 mb-2 last:mb-0">
                        <span className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold">{item.heading}</div>
                          <div className="text-[11px] text-gray-500 line-clamp-2">{item.content}</div>
                          {item.note && (
                            <div className="text-[11px] text-amber-700 mt-1 bg-warn-bg px-2 py-1 rounded">
                              ⚠ {item.note}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>

                {/* Actions */}
                {rejectId === req.id ? (
                  <div className="px-4 py-3 border-t border-gray-100">
                    <label className="block text-[11px] font-bold text-gray-500 mb-1">差し戻し理由</label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="修正すべき点を具体的に記入"
                      rows={2}
                      className="input-field resize-none mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setRejectId(null); setRejectReason('') }}
                        className="flex-1 text-sm font-semibold py-2.5 rounded-xl border border-gray-200 text-gray-500 active:bg-gray-50"
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={() => handleReject(req.id, proc.id)}
                        disabled={!rejectReason.trim() || processing === req.id}
                        className="flex-1 text-sm font-semibold py-2.5 rounded-xl bg-red-500 text-white disabled:opacity-50 active:scale-[0.98]"
                      >
                        差し戻す
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 px-4 py-3 border-t border-gray-100">
                    <button
                      onClick={() => setRejectId(req.id)}
                      disabled={processing === req.id}
                      className="flex-1 text-sm font-semibold py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 active:scale-[0.98]"
                    >
                      差し戻し
                    </button>
                    <button
                      onClick={() => handleApprove(req.id, proc.id)}
                      disabled={processing === req.id}
                      className="flex-1 text-sm font-semibold py-2.5 rounded-xl bg-primary text-white active:scale-[0.98] disabled:opacity-50"
                    >
                      {processing === req.id ? '処理中...' : '✅ 承認する'}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
