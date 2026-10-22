import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h1 className="text-[32px] leading-[1.2] font-medium tracking-tight lg:text-[48px]">{title}</h1>
      {subtitle && <p className="max-w-[560px] text-base text-neutral-600">{subtitle}</p>}
      {action}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[32px] bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.04)] lg:p-8 ${className}`}>{children}</div>
}

export function Panel({ children, className = '', active = false }: { children: ReactNode; className?: string; active?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 lg:p-6 ${active ? 'border-neutral-800 bg-gray-100' : 'border-neutral-200/80 bg-white'} ${className}`}>
      {children}
    </div>
  )
}

export const btnDark =
  'inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-ink px-5 text-[16px] font-semibold text-white ring-1 ring-black transition hover:bg-neutral-800'
export const btnLight =
  'inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-white px-5 text-[16px] font-semibold text-ink ring-1 ring-neutral-300 transition hover:bg-gray-100'

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="!rounded-2xl !p-3 sm:!rounded-[32px] sm:!p-6">
      <p className="text-xs font-medium text-neutral-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-xl leading-none font-semibold tracking-tight sm:mt-2 sm:text-[36px]">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-emerald-600 sm:mt-2 sm:text-sm">{hint}</p>}
    </Card>
  )
}
