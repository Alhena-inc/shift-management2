'use client'

import { useState } from 'react'

interface AccordionProps {
  items: {
    id: string
    title: string
    icon: string
    color: string
    children: React.ReactNode
  }[]
  defaultOpen?: string[]
}

export default function Accordion({ items, defaultOpen = [] }: AccordionProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(defaultOpen))

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const isOpen = openIds.has(item.id)
        return (
          <div key={item.id}>
            <button
              onClick={() => toggle(item.id)}
              className={`flex items-center gap-2.5 w-full px-4 py-3.5 bg-white border-[1.5px] border-gray-200 text-left font-sans font-semibold text-sm text-gray-900 active:bg-gray-50 transition-all
                ${isOpen ? 'rounded-t-[14px] border-b-transparent' : 'rounded-[14px]'}`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: item.color }}
              />
              <span className="text-xl">{item.icon}</span>
              <span className="flex-1">{item.title}</span>
              <svg
                width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="#9DA3AE" strokeWidth="2.5" strokeLinecap="round"
                className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {isOpen && (
              <div className="bg-white border-[1.5px] border-gray-200 border-t-0 rounded-b-[14px] px-4 pb-3.5">
                {item.children}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
