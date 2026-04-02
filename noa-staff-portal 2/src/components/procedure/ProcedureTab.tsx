'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { ProcedureWithItems, UserRole } from '@/types/database'

interface Props {
  procedures: ProcedureWithItems[]
  clientId: string
  role: UserRole
  userId: string
}

// ─── Status Badge ───
function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') {
    return (
      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 inline-flex items-center gap-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
        承認済
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-600 inline-flex items-center gap-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        承認待ち
      </span>
    )
  }
  if (status === 'draft') {
    return (
      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
        下書き
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-50 text-red-500">
        差し戻し
      </span>
    )
  }
  return null
}

// ─── Procedure Detail View ───
function ProcedureDetailView({ proc, onBack }: { proc: ProcedureWithItems; onBack: () => void }) {
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])

  const scrollToStep = (idx: number) => {
    stepRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="p-4">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-primary font-semibold text-[13px] mb-3 active:opacity-70"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        手順書一覧に戻る
      </button>

      {/* Title */}
      <h3 className="text-lg font-bold mb-1">{proc.title}</h3>
      <div className="mb-4">
        <StatusBadge status={proc.status} />
      </div>

      {/* TOC */}
      <div className="card p-4 mb-4">
        <div className="text-[13px] font-bold text-primary mb-3 flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          全体の流れ
        </div>
        {proc.items.map((item, i) => (
          <button
            key={item.id}
            onClick={() => scrollToStep(i)}
            className="flex items-center gap-2.5 w-full py-2.5 border-b border-gray-100 last:border-b-0 text-left active:text-primary transition-colors"
          >
            <span className="w-[26px] h-[26px] rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
              {i + 1}
            </span>
            <span className="text-sm font-medium">{item.heading}</span>
          </button>
        ))}
      </div>

      {/* Steps */}
      {proc.items.map((item, i) => (
        <div
          key={item.id}
          ref={(el) => { stepRefs.current[i] = el }}
          className="card overflow-hidden mb-3"
        >
          {/* Step Header */}
          <div className="flex items-center gap-2.5 px-4 py-3.5 bg-primary-light border-b border-primary-mid">
            <span className="w-[26px] h-[26px] rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
              {i + 1}
            </span>
            <span className="text-sm font-bold text-primary-dark">{item.heading}</span>
          </div>

          {/* Content */}
          <div className="px-4 py-3.5 text-[13px] leading-relaxed">
            {item.content}
          </div>

          {/* Note */}
          {item.note && (
            <div className="mx-4 mb-3.5 px-3.5 py-3 bg-warn-bg border-[1.5px] border-warn-border rounded-[10px] text-xs leading-relaxed text-amber-800 flex gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8950A" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{item.note}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main ProcedureTab ───
export default function ProcedureTab({ procedures, clientId, role, userId }: Props) {
  const router = useRouter()
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  if (selectedIdx !== null && procedures[selectedIdx]) {
    return (
      <ProcedureDetailView
        proc={procedures[selectedIdx]}
        onBack={() => setSelectedIdx(null)}
      />
    )
  }

  return (
    <div className="p-4">
      {/* Create button */}
      <button
        onClick={() => router.push(`/clients/${clientId}/procedures/new`)}
        className="w-full card flex items-center justify-center gap-2 px-4 py-3.5 mb-3 text-primary font-semibold text-sm active:scale-[0.98] transition-transform border-dashed border-primary"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        手順書を作成する
      </button>

      {/* List */}
      {procedures.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📖</div>
          <div className="text-sm">手順書がまだありません</div>
        </div>
      ) : (
        procedures.map((proc, i) => (
          <button
            key={proc.id}
            onClick={() => setSelectedIdx(i)}
            className="card w-full text-left mb-3 overflow-hidden active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3 px-4 py-4">
              <span className="text-[22px]">📖</span>
              <span className="flex-1 text-[15px] font-semibold">{proc.title}</span>
              <StatusBadge status={proc.status} />
            </div>
            {proc.status === 'rejected' && proc.rejection_reason && (
              <div className="px-4 pb-3 text-xs text-red-500">
                差し戻し理由: {proc.rejection_reason}
              </div>
            )}
          </button>
        ))
      )}
    </div>
  )
}
