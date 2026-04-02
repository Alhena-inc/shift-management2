interface InfoGroupProps {
  title: string
  icon?: string
  children: React.ReactNode
}

export default function InfoGroup({ title, icon, children }: InfoGroupProps) {
  return (
    <div className="card overflow-hidden mb-3">
      <div className="section-header">
        {icon && <span className="mr-1">{icon}</span>}
        {title}
      </div>
      {children}
    </div>
  )
}

interface InfoRowProps {
  label: string
  children: React.ReactNode
}

export function InfoRow({ label, children }: InfoRowProps) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{children}</span>
    </div>
  )
}

export function PhoneLink({ number }: { number: string }) {
  return (
    <a
      href={`tel:${number}`}
      className="text-primary font-semibold inline-flex items-center gap-1"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
      {number}
    </a>
  )
}

export function DiseaseTag({ name }: { name: string }) {
  return (
    <span className="inline-block bg-danger-bg text-danger text-xs font-semibold px-2.5 py-0.5 rounded-md mr-1 mb-1">
      {name}
    </span>
  )
}

export function ServiceBadge({ type }: { type: string }) {
  return (
    <span className="inline-block bg-primary-light text-primary text-[11px] font-semibold px-2 py-0.5 rounded-md">
      {type}
    </span>
  )
}
