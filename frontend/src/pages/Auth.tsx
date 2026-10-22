import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/landing/shared'
import { btnDark } from '../components/app/ui'

const field = 'mt-2 h-12 w-full rounded-lg border border-neutral-200 bg-white px-4 text-base font-normal outline-none focus:border-neutral-800'

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const navigate = useNavigate()
  const signup = mode === 'signup'
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fffffe] via-[#fffff2] to-[#f4fafa]">
      <header className="mx-auto flex h-20 max-w-[1440px] items-center px-5 lg:px-20">
        <Logo height={36} href="/" />
      </header>
      <main className="mx-auto max-w-[460px] px-5 pt-10 pb-24 lg:pt-[72px]">
        <h1 className="text-center text-[32px] leading-[1.2] font-medium tracking-tight lg:text-[48px]">
          {signup ? 'Crie sua conta' : 'Bem-vindo de volta'}
        </h1>
        <p className="mt-3 text-center text-base text-neutral-600">
          {signup ? 'Leva menos de um minuto. Depois é só vincular o Telegram.' : 'Entre para acompanhar seus treinos.'}
        </p>
        <form
          className="mt-10 grid gap-5 rounded-[32px] bg-white p-6 text-sm font-semibold shadow-[0_4px_30px_rgba(0,0,0,0.04)] lg:p-8"
          onSubmit={(e) => {
            e.preventDefault()
            navigate(signup ? '/vincular' : '/app')
          }}
        >
          {signup && (
            <label>
              Nome
              <input className={field} placeholder="Seu nome" />
            </label>
          )}
          <label>
            E-mail
            <input type="email" className={field} placeholder="voce@email.com" />
          </label>
          <label>
            Senha
            <input type="password" className={field} placeholder="••••••••" />
          </label>
          <button type="submit" className={`${btnDark} w-full`}>
            {signup ? 'Criar conta' : 'Entrar'}
          </button>
          <p className="text-center text-sm font-normal text-neutral-500">
            {signup ? 'Já tem conta? ' : 'Ainda não tem conta? '}
            <Link to={signup ? '/entrar' : '/cadastro'} className="font-semibold text-ink underline">
              {signup ? 'Entrar' : 'Cadastre-se'}
            </Link>
          </p>
        </form>
      </main>
    </div>
  )
}
