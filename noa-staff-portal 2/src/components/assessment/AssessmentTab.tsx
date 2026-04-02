'use client'

import Accordion from '@/components/ui/Accordion'
import { PhoneLink } from '@/components/ui/InfoGroup'
import type { Assessment, AssessmentCategory, AssessmentItem } from '@/types/database'

interface Props {
  assessment: Assessment | null
}

function AssessmentItemView({ item }: { item: AssessmentItem }) {
  let valueClass = 'text-[13px] leading-relaxed'

  if (item.type === 'warning') {
    valueClass += ' text-amber-800 bg-warn-bg px-2.5 py-1.5 rounded-[10px] border border-warn-border mt-1'
  } else if (item.type === 'disease') {
    valueClass = 'inline-block bg-danger-bg text-danger text-xs font-semibold px-2.5 py-0.5 rounded-md'
  } else if (item.type === 'has_support') {
    valueClass += ' text-primary font-semibold'
  }

  return (
    <div className="py-2.5 border-b border-gray-100 last:border-b-0">
      <div className="text-[11px] font-bold text-gray-500 mb-1">{item.label}</div>
      {item.type === 'phone' ? (
        <PhoneLink number={item.value} />
      ) : (
        <div className={valueClass}>{item.value}</div>
      )}
    </div>
  )
}

export default function AssessmentTab({ assessment }: Props) {
  if (!assessment) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-4xl mb-3">📝</div>
        <div className="text-sm">アセスメントが未登録です</div>
      </div>
    )
  }

  const categories: AssessmentCategory[] = assessment.data || []

  return (
    <div className="p-4">
      {/* Meta */}
      <div className="flex gap-4 flex-wrap text-xs text-gray-500 bg-white rounded-[10px] border border-gray-200 px-3.5 py-2.5 mb-3">
        <span>📅 {assessment.assessed_date}</span>
        <span>👤 評価者：{assessment.assessor_name}</span>
      </div>

      {/* Overview */}
      {assessment.overview && (
        <div className="card p-4 mb-4">
          <div className="text-[13px] font-bold text-primary mb-2 flex items-center gap-1.5">
            📋 概要（支援経過・現状と課題）
          </div>
          <p className="text-[13px] leading-relaxed text-gray-900">
            {assessment.overview}
          </p>
        </div>
      )}

      {/* Accordion categories */}
      <Accordion
        defaultOpen={categories.length > 0 ? [categories[0].id] : []}
        items={categories.map((cat) => ({
          id: cat.id,
          title: cat.title,
          icon: cat.icon,
          color: cat.color,
          children: (
            <>
              {cat.sections.map((sec, si) => (
                <div key={si}>
                  <div className="text-xs font-bold text-primary py-3 border-b border-gray-200">
                    {sec.title}
                  </div>
                  {sec.items.map((item, ii) => (
                    <AssessmentItemView key={ii} item={item} />
                  ))}
                </div>
              ))}
            </>
          ),
        }))}
      />
    </div>
  )
}
