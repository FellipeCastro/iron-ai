import { useAuth, useSignIn, useSignUp } from '@clerk/react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../components/landing/shared'
import { btnDark } from '../components/app/ui'

const field = 'mt-2 h-12 w-full rounded-lg border border-neutral-200 bg-white px-4 text-base font-normal outline-none focus:border-neutral-800'
const errorText = 'mt-1 block text-sm font-normal text-red-600'

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const { isLoaded, isSignedIn } = useAuth()
  const navigate = useNavigate()
  const { signIn, errors: signInErrors, fetchStatus: signInStatus } = useSignIn()
  const { signUp, errors: signUpErrors, fetchStatus: signUpStatus } = useSignUp()
  const signup = mode === 'signup'
  const [verifying, setVerifying] = useState(false)
  const [formError, setFormError] = useState('')

  const errors = signup ? signUpErrors : signInErrors
  const busy = (signup ? signUpStatus : signInStatus) === 'fetching'
  const afterAuth = signup ? '/vincular' : '/app'

  if (isLoaded && isSignedIn) return <Navigate to="/app" replace />

  const finalize = (resource: typeof signIn | typeof signUp) =>
    resource.finalize({
      navigate: ({ decorateUrl }) => {
        const url = decorateUrl(afterAuth)
        if (url.startsWith('http')) window.location.href = url
        else navigate(url)
      },
    })

  async function submitCredentials(data: FormData) {
    setFormError('')
    const email = String(data.get('email'))
    const password = String(data.get('password'))

    if (signup) {
      const { error } = await signUp.password({ emailAddress: email, password, firstName: String(data.get('name')).trim() })
      if (error) return
      const sent = await signUp.verifications.sendEmailCode()
      if (sent.error) return
      setVerifying(true)
      return
    }

    const { error } = await signIn.password({ identifier: email, password })
    if (error) return
    if (signIn.status === 'complete') return void (await finalize(signIn))
    if (signIn.status === 'needs_client_trust') {
      const sent = await signIn.mfa.sendEmailCode()
      if (!sent.error) setVerifying(true)
      return
    }
    setFormError('Não foi possível concluir o login. Tente novamente.')
  }

  async function submitCode(data: FormData) {
    setFormError('')
    const code = String(data.get('code'))
    if (signup) {
      const { error } = await signUp.verifications.verifyEmailCode({ code })
      if (!error && signUp.status === 'complete') await finalize(signUp)
      return
    }
    const { error } = await signIn.mfa.verifyEmailCode({ code })
    if (!error && signIn.status === 'complete') await finalize(signIn)
  }

  async function signInWithGoogle() {
    setFormError('')
    const { error } = await signIn.sso({
      strategy: 'oauth_google',
      redirectUrl: '/app',
      redirectCallbackUrl: '/sso-callback',
    })
    if (error) setFormError(error.longMessage ?? error.message)
  }

  const globalMessage = formError || errors?.global?.[0]?.longMessage || errors?.global?.[0]?.message

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fffffe] via-[#fffff2] to-[#f4fafa]">
      <header className="mx-auto flex h-20 max-w-[1440px] items-center px-5 lg:px-20">
        <Logo height={36} href="/" />
      </header>
      <main className="mx-auto max-w-[460px] px-5 pt-10 pb-24 lg:pt-[72px]">
        <h1 className="text-center text-[32px] leading-[1.2] font-medium tracking-tight lg:text-[48px]">
          {verifying ? 'Verifique seu e-mail' : signup ? 'Crie sua conta' : 'Bem-vindo de volta'}
        </h1>
        <p className="mt-3 text-center text-base text-neutral-600">
          {verifying
            ? 'Enviamos um código de verificação para o seu e-mail.'
            : signup
              ? 'Leva menos de um minuto. Depois é só vincular o Telegram.'
              : 'Entre para acompanhar seus treinos.'}
        </p>
        <form
          className="mt-10 grid gap-5 rounded-[32px] bg-white p-6 text-sm font-semibold shadow-[0_4px_30px_rgba(0,0,0,0.04)] lg:p-8"
          action={verifying ? submitCode : submitCredentials}
        >
          {!verifying && (
            <>
              <button type="button" onClick={signInWithGoogle} disabled={busy} className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-neutral-200 bg-white text-base font-semibold transition hover:bg-gray-50 disabled:opacity-60">
                <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
                  <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
                </svg>
                Continuar com Google
              </button>
              <div className="flex items-center gap-3 text-xs font-normal text-neutral-400">
                <span className="h-px flex-1 bg-neutral-200" />
                ou
                <span className="h-px flex-1 bg-neutral-200" />
              </div>
            </>
          )}
          {verifying ? (
            <label>
              Código
              <input name="code" inputMode="numeric" autoComplete="one-time-code" required className={field} placeholder="123456" />
              {errors?.fields?.code && <span className={errorText}>{errors.fields.code.message}</span>}
            </label>
          ) : (
            <>
              {signup && (
                <label>
                  Nome
                  <input name="name" required className={field} placeholder="Seu nome" />
                  {signUpErrors?.fields?.firstName && <span className={errorText}>{signUpErrors.fields.firstName.message}</span>}
                </label>
              )}
              <label>
                E-mail
                <input name="email" type="email" required className={field} placeholder="voce@email.com" />
                {(signup ? signUpErrors?.fields?.emailAddress : signInErrors?.fields?.identifier) && (
                  <span className={errorText}>{(signup ? signUpErrors?.fields?.emailAddress : signInErrors?.fields?.identifier)?.message}</span>
                )}
              </label>
              <label>
                Senha
                <input name="password" type="password" required className={field} placeholder="••••••••" />
                {errors?.fields?.password && <span className={errorText}>{errors.fields.password.message}</span>}
              </label>
            </>
          )}
          {globalMessage && <p className="text-sm font-normal text-red-600">{globalMessage}</p>}
          {signup && !verifying && <div id="clerk-captcha" />}
          <button type="submit" disabled={busy} className={`${btnDark} w-full disabled:opacity-60`}>
            {verifying ? 'Verificar' : signup ? 'Criar conta' : 'Entrar'}
          </button>
          {!verifying && (
            <p className="text-center text-sm font-normal text-neutral-500">
              {signup ? 'Já tem conta? ' : 'Ainda não tem conta? '}
              <Link to={signup ? '/entrar' : '/cadastro'} className="font-semibold text-ink underline">
                {signup ? 'Entrar' : 'Cadastre-se'}
              </Link>
            </p>
          )}
        </form>
      </main>
    </div>
  )
}
