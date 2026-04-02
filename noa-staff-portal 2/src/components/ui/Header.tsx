'use client'

import { useRouter } from 'next/navigation'

interface HeaderProps {
  title: string
  showBack?: boolean
  badge?: string
  rightAction?: React.ReactNode
}

export default function Header({ title, showBack, badge, rightAction }: HeaderProps) {
  const router = useRouter()

  return (
    <header className="bg-primary text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-50">
      {showBack && (
        <button
          onClick={() => router.back()}
          className="p-1 rounded-lg active:bg-white/15 transition-colors"
          aria-label="戻る"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}
      <h1 className="text-base font-semibold flex-1 truncate">{title}</h1>
      {badge && (
        <span className="bg-white/20 text-[11px] px-2 py-0.5 rounded-full font-medium">
          {badge}
        </span>
      )}
      {rightAction}
    </header>
  )
}
