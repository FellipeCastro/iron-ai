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

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="mt-16 grid place-items-center gap-3 text-neutral-500">
      <span className="size-8 animate-spin rounded-full border-2 border-neutral-300 border-t-ink" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-[560px] text-center">
      <h3 className="text-xl font-semibold">Não foi possível carregar</h3>
      <p className="mt-2 text-[15px] text-neutral-500">{error.message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${btnLight} mt-5`}>
          Tentar de novo
        </button>
      )}
    </Card>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="mx-auto mt-10 max-w-[560px] text-center">
      <h3 className="text-xl font-semibold">{title}</h3>
      {children && <p className="mt-2 text-[15px] text-neutral-500">{children}</p>}
    </Card>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="!rounded-2xl !p-3 sm:!rounded-[32px] sm:!p-6">
      <p className="text-xs font-medium text-neutral-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-xl leading-none font-semibold tracking-tight sm:mt-2 sm:text-[36px]">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-emerald-600 sm:mt-2 sm:text-sm">{hint}</p>}
    </Card>
  )
}
