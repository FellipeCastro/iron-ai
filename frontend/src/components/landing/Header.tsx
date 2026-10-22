import { CtaButtons, Logo } from './shared'

const links = [
  { label: 'Recursos', href: '#recursos' },
  { label: 'Como funciona', href: '#como-funciona' },
  { label: 'Lembretes', href: '#lembretes' },
  { label: 'FAQ', href: '#faq' },
]

export function Header() {
  return (
    <>
    <div className="h-20" />
    <header className="fixed inset-x-0 top-0 z-50 bg-white/40 backdrop-blur-md">
    <div className="relative mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 lg:px-20">
      <Logo height={28} />
      <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-[30px] text-base font-medium lg:flex">
        {links.map((l) => (
          <a key={l.label} href={l.href} className="transition hover:opacity-60">
            {l.label}
          </a>
        ))}
      </nav>
      <div className="hidden items-center gap-6 text-base font-medium lg:flex">
        <a href="/entrar" className="transition hover:opacity-60">
          Entrar
        </a>
        <CtaButtons size="sm" />
      </div>
      <div className="flex items-center gap-4 text-[15px] font-medium lg:hidden">
        <a href="/entrar">Entrar</a>
        <a
          href="/cadastro"
          className="inline-flex h-10 items-center rounded-lg bg-ink px-4 font-semibold text-white ring-1 ring-black"
        >
          Começar
        </a>
      </div>
    </div>
    </header>
    </>
  )
}
