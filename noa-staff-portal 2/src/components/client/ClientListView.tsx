'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/ui/Header'
import SearchBar from '@/components/ui/SearchBar'
import ToggleBar from '@/components/ui/ToggleBar'
import { ServiceBadge } from '@/components/ui/InfoGroup'
import type { Client, UserRole } from '@/types/database'

interface Props {
  clients: Client[]
  assignedIds: string[]
  role: UserRole
  displayName: string
  pendingCount: number
}

const ROLE_LABELS: Record<UserRole, string> = {
  helper: 'ヘルパー',
  coordinator: 'サービス提供責任者',
  admin: '管理者',
}

export default function ClientListView({ clients, assignedIds, role, displayName, pendingCount }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>(role === 'helper' ? 'assigned' : 'all')

  const assignedSet = new Set(assignedIds)

  const filtered = clients.filter((c) => {
    // Filter by assignment
    if (filter === 'assigned' && !assignedSet.has(c.id)) return false

    // Search
    if (search) {
      const q = search.toLowerCase()
      return (
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.furigana && c.furigana.toLowerCase().includes(q)) ||
        (c.address && c.address.includes(q)) ||
        (c.service_type && c.service_type.includes(q))
      )
    }
    return true
  })

  return (
    <>
      <Header
        title="のあスタッフポータル"
        badge={ROLE_LABELS[role]}
        rightAction={
          role !== 'helper' && pendingCount > 0 ? (
            <button
              onClick={() => router.push('/approvals')}
              className="relative p-1.5 rounded-lg active:bg-white/15"
              aria-label="承認待ち"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">
                {pendingCount}
              </span>
            </button>
          ) : undefined
        }
      />

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="利用者名・地区・サービスで検索"
      />

      {role !== 'helper' && (
        <ToggleBar
          options={[
            { key: 'assigned', label: 'わたしの担当', icon: '👤' },
            { key: 'all', label: '全利用者', icon: '👥' },
          ]}
          selected={filter}
          onChange={setFilter}
        />
      )}

      <div className="px-4 pb-24 flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-3">🔍</div>
            <div className="text-sm">該当する利用者が見つかりません</div>
          </div>
        ) : (
          filtered.map((client, i) => (
            <button
              key={client.id}
              onClick={() => router.push(`/clients/${client.id}`)}
              className="card flex items-center gap-3.5 px-4 py-3.5 text-left active:scale-[0.98] active:border-primary transition-all"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              {/* Avatar */}
              <div className="w-[46px] h-[46px] rounded-full bg-primary-light text-primary flex items-center justify-center text-base font-bold shrink-0">
                {client.name.charAt(0)}
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold mb-0.5 truncate">
                  {client.name}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                  {client.age && <span>{client.age}歳</span>}
                  {client.address && (
                    <span className="truncate max-w-[120px]">
                      {client.address.replace(/大阪府大阪市/, '')}
                    </span>
                  )}
                  {client.service_type && <ServiceBadge type={client.service_type} />}
                </div>
              </div>

              {/* Arrow */}
              <span className="text-gray-400 text-lg shrink-0">›</span>
            </button>
          ))
        )}
      </div>
    </>
  )
}
