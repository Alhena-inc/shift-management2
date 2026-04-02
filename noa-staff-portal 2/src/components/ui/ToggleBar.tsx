'use client'

interface ToggleBarProps {
  options: { key: string; label: string; icon?: string }[]
  selected: string
  onChange: (key: string) => void
}

export default function ToggleBar({ options, selected, onChange }: ToggleBarProps) {
  return (
    <div className="flex mx-4 mb-3 bg-white rounded-[14px] p-[3px] border-[1.5px] border-gray-200">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`flex-1 py-2.5 text-[13px] font-semibold rounded-[11px] transition-all duration-200 font-sans
            ${selected === opt.key
              ? 'bg-primary text-white shadow-md shadow-primary/30'
              : 'text-gray-500 bg-transparent'
            }`}
        >
          {opt.icon && <span className="mr-1">{opt.icon}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  )
}
