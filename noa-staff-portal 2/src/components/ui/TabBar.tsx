'use client'

interface TabBarProps {
  tabs: { key: string; label: string; icon: string }[]
  selected: string
  onChange: (key: string) => void
}

export default function TabBar({ tabs, selected, onChange }: TabBarProps) {
  return (
    <div className="flex bg-white border-b-[1.5px] border-gray-200 sticky top-[50px] z-40">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-1 py-3.5 pb-3 flex flex-col items-center gap-1 text-xs font-semibold font-sans relative transition-colors
            ${selected === tab.key ? 'text-primary' : 'text-gray-400'}`}
        >
          <span className="text-lg">{tab.icon}</span>
          {tab.label}
          {selected === tab.key && (
            <span className="absolute bottom-0 left-[20%] right-[20%] h-[3px] bg-primary rounded-t-sm" />
          )}
        </button>
      ))}
    </div>
  )
}
