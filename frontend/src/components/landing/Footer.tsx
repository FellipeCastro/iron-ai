import { Dumbbell } from 'lucide-react'
import { CtaButtons, Logo } from './shared'

function Laurel({ flip = false }: { flip?: boolean }) {
  const leaves = Array.from({ length: 7 }).map((_, i) => {
    const t = i / 6
    const y = 112 - 100 * t
    const x = 26 - 14 * t * t
    return { x, y, s: 1 - t * 0.25 }
  })
  return (
    <svg width="44" height="124" viewBox="0 0 44 124" fill="#3f3b46" className={flip ? '-scale-x-100' : ''} aria-hidden="true">
      <path d="M28 122C26 100 18 60 12 6" stroke="#3f3b46" strokeWidth="1.6" fill="none" />
      {leaves.map((l, i) => (
        <g key={i}>
          <ellipse cx={l.x - 7} cy={l.y} rx={3.4 * l.s} ry={9 * l.s} transform={`rotate(-38 ${l.x - 7} ${l.y})`} />
          <ellipse cx={l.x + 7} cy={l.y - 5} rx={3.4 * l.s} ry={9 * l.s} transform={`rotate(38 ${l.x + 7} ${l.y - 5})`} />
        </g>
      ))}
      <ellipse cx="11" cy="6" rx="3" ry="8" transform="rotate(-8 11 6)" />
    </svg>
  )
}

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-[#f8f1ec] bg-[radial-gradient(ellipse_at_left,#e6ebee,transparent_60%),radial-gradient(ellipse_at_bottom_right,#f5e1e1,transparent_60%)] px-5 py-20 lg:h-[625px] lg:px-0 lg:py-0">
      <div className="absolute top-[212px] left-[336px] hidden lg:block">
        <Laurel />
      </div>
      <div className="absolute top-[212px] left-[1062px] hidden lg:block">
        <Laurel flip />
      </div>
      <div className="flex flex-col items-center lg:pt-[183px]">
        <span className="grid size-[44px] place-items-center rounded-full bg-ink text-white">
          <Dumbbell className="size-[22px]" />
        </span>
        <h2 className="mt-[14px] w-full max-w-[440px] text-center text-[36px] leading-[40px] font-bold tracking-tight lg:text-[48px] lg:leading-[48px]">
          Mande a primeira série hoje
        </h2>
        <div className="mt-[18px] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-base">
          <span>Registro por mensagem</span>
          <span className="text-neutral-400">·</span>
          <span>Evolução no site</span>
        </div>
        <div className="mt-[36px]">
          <CtaButtons size="sm" />
        </div>
      </div>
    </section>
  )
}

function Social({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <a href="#top" aria-label={label} className="text-ink">
      {children}
    </a>
  )
}

export function Footer() {
  return (
    <footer className="mx-auto max-w-[1440px] px-5 pt-10 lg:px-20 lg:pt-7">
      <div className="grid grid-cols-1 gap-10 px-4 pb-8 lg:grid-cols-[427px_427px_1fr] lg:gap-0 lg:pb-[10px]">
        <div>
          <Logo height={36} />
          <p className="mt-[28px] text-sm">Fale com o Iron AI</p>
          <div className="mt-4">
            <CtaButtons size="sm" />
          </div>
        </div>
        <div>
          <h4 className="pt-1 text-[15px] font-bold">Legal</h4>
          <ul className="mt-[22px] space-y-3 text-sm leading-5 text-neutral-600">
            <li>Política de Privacidade</li>
            <li>Termos de uso</li>
            <li>Exclusão de conta e dados (LGPD)</li>
          </ul>
        </div>
        <div>
          <h4 className="pt-1 text-[15px] font-bold">Empresa</h4>
          <ul className="mt-[22px] space-y-3 text-sm leading-5 text-neutral-600">
            <li>FAQ</li>
            <li>Contato</li>
            <li>Como funciona</li>
            <li className="flex items-center gap-2">
              Lembretes
              <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white">Novo</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col items-start gap-4 border-t border-neutral-200 px-4 py-4 text-sm text-neutral-600 sm:flex-row sm:items-center sm:justify-between lg:py-[10px]">
        <span>© Copyright 2026, Todos os direitos reservados</span>
        <div className="flex items-center gap-6">
          <Social label="LinkedIn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="20" rx="3" />
              <path d="M7 10v7M7 7v.01M11 17v-7M11 13c0-2 1.5-3 3-3s3 1 3 3v4" />
            </svg>
          </Social>
          <Social label="Instagram">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
              <circle cx="12" cy="12" r="4.2" />
              <circle cx="17.3" cy="6.7" r=".6" fill="currentColor" />
            </svg>
          </Social>
          <Social label="TikTok">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.6 2h-3.2v13.3a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .8.1V9.2a6.1 6.1 0 1 0 5.3 6.1V8.6a7.3 7.3 0 0 0 4.3 1.4V6.8a4.3 4.3 0 0 1-4.3-4.8z" />
            </svg>
          </Social>
        </div>
      </div>
    </footer>
  )
}
