import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { Logo } from '../landing/shared'

const links = [
  { label: 'Dashboard', to: '/app' },
  { label: 'Treinos', to: '/app/treinos' },
  { label: 'Histórico', to: '/app/historico' },
  { label: 'Progresso', to: '/app/progresso' },
]

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user } = useUser()
  const name = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? ''
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
  return (
    <div className="min-h-screen overflow-x-clip bg-gradient-to-b from-[#fffffe] via-[#f8fbf6] to-[#f4fafa]">
      <header className="relative z-20 mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 lg:px-20">
        <Logo height={28} href="/app" />
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-[30px] text-base font-medium lg:flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/app'}
              className={({ isActive }) => `transition hover:opacity-60 ${isActive ? 'font-semibold underline decoration-2 underline-offset-8' : ''}`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-[15px] font-medium">
          <NavLink
            to="/app/perfil"
            aria-label="Abrir perfil"
            className={({ isActive }) => `flex items-center gap-3 rounded-full py-1 pr-1 pl-3 transition hover:bg-gray-100 ${isActive ? 'bg-gray-100' : ''}`}
          >
            <span className="hidden text-neutral-600 lg:inline">{name}</span>
            <span className="grid size-10 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{initials}</span>
          </NavLink>
          <button
            type="button"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="grid size-10 place-items-center rounded-lg ring-1 ring-neutral-300 transition hover:bg-gray-100 lg:hidden"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </header>
      {menuOpen && (
        <nav className="relative z-10 mx-5 -mt-1 flex flex-col gap-1 rounded-2xl border border-neutral-200/80 bg-white p-2 text-base font-medium shadow-[0_10px_30px_rgba(0,0,0,0.08)] lg:hidden">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/app'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `rounded-lg px-4 py-3 transition ${isActive ? 'bg-ink text-white' : 'hover:bg-gray-100'}`}
            >
              {l.label}
            </NavLink>
          ))}
          <NavLink
            to="/app/perfil"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) => `rounded-lg px-4 py-3 transition ${isActive ? 'bg-ink text-white' : 'hover:bg-gray-100'}`}
          >
            Perfil
          </NavLink>
        </nav>
      )}
      <main className="mx-auto max-w-[1120px] px-5 pt-10 pb-24 lg:pt-[72px] lg:pb-[140px]">
        <Outlet />
      </main>
    </div>
  )
}
