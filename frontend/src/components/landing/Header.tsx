import { CtaButtons, Logo } from './shared'

const links = [
  { label: 'Recursos', href: '#recursos' },
  { label: 'Como funciona', href: '#como-funciona' },
  { label: 'Lembretes', href: '#lembretes' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Entrar', href: '/entrar' },
]

export function Header() {
  return (
    <header className="relative z-20 mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 lg:px-20">
      <Logo height={36} />
      <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-[30px] text-base font-medium lg:flex">
        {links.map((l) => (
          <a key={l.label} href={l.href} className="transition hover:opacity-60">
            {l.label}
          </a>
        ))}
      </nav>
      <div className="hidden lg:block">
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
    </header>
  )
}
