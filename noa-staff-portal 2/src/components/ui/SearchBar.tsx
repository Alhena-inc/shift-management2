'use client'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function SearchBar({ value, onChange, placeholder = '検索' }: SearchBarProps) {
  return (
    <div className="px-4 pt-3 pb-2 sticky top-[50px] z-40 bg-gray-50">
      <div className="flex items-center gap-2 bg-white border-[1.5px] border-gray-200 rounded-[14px] px-3.5 py-2.5 focus-within:border-primary transition-colors">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9DA3AE" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="border-none outline-none text-[15px] w-full font-sans bg-transparent placeholder:text-gray-400"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="text-gray-400 p-0.5"
            aria-label="クリア"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
