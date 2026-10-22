import { Check, Copy, Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/landing/shared'
import { btnDark, btnLight } from '../components/app/ui'
import { type LinkCode, type Me, useApi } from '../lib/api'

export default function LinkTelegram() {
  const api = useApi()
  const navigate = useNavigate()
  const [link, setLink] = useState<LinkCode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [copied, setCopied] = useState(false)
  const [linked, setLinked] = useState(false)
  const started = useRef(false)

  const generate = useCallback(async () => {
    setError(null)
    setCopied(false)
    try {
      const next = await api<LinkCode>('/link-code', { method: 'POST' })
      setLink(next)
      setSeconds(Math.max(0, Math.round((new Date(next.expires_at).getTime() - Date.now()) / 1000)))
    } catch (err) {
      setError((err as Error).message)
    }
  }, [api])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        const me = await api<Me>('/me')
        if (me.linked) return setLinked(true)
      } catch {
        /* segue e tenta gerar o código */
      }
      void generate()
    })()
  }, [api, generate])

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [])

  // consulta o status até a conta ser vinculada pelo bot
  useEffect(() => {
    if (!link || linked) return
    const id = setInterval(() => {
      api<Me>('/me').then((me) => me.linked && setLinked(true), () => undefined)
    }, 3000)
    return () => clearInterval(id)
  }, [api, link, linked])

  useEffect(() => {
    if (!linked) return
    const id = setTimeout(() => navigate('/app'), 1800)
    return () => clearTimeout(id)
  }, [linked, navigate])

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  const expired = link !== null && seconds === 0

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fffffe] via-[#f8fbf6] to-[#f0f8fe]">
      <header className="mx-auto flex h-20 max-w-[1440px] items-center px-5 lg:px-20">
        <Logo height={36} href="/" />
      </header>
      <main className="mx-auto max-w-[560px] px-5 pt-10 pb-24 lg:pt-[72px]">
        <h1 className="text-center text-[32px] leading-[1.2] font-medium tracking-tight lg:text-[48px]">Vincule o Telegram</h1>

        {linked ? (
          <div role="status" className="mt-10 rounded-[32px] bg-[#1e1a24] p-8 text-center text-white">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-500">
              <Check className="size-7" />
            </span>
            <p className="mt-4 text-xl font-semibold">Telegram vinculado!</p>
            <p className="mt-1 text-sm text-white/70">Levando você para o painel…</p>
          </div>
        ) : (
          <>
            <p className="mt-3 text-center text-base text-neutral-600">Abra o bot do Iron e envie o código abaixo para conectar sua conta.</p>

            <div className="mt-10 rounded-[32px] bg-[#1e1a24] p-6 text-center text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] lg:p-10">
              {error ? (
                <>
                  <p className="text-sm font-medium text-white/80">{error}</p>
                  <button type="button" onClick={generate} className="mt-6 inline-flex h-12 items-center rounded-lg bg-white px-5 font-semibold text-ink">
                    Tentar de novo
                  </button>
                </>
              ) : !link ? (
                <p className="py-8 text-sm text-white/70">Gerando seu código…</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-white/70">Seu código</p>
                  <p className={`mt-3 text-[34px] leading-none font-bold tracking-[0.1em] sm:text-[44px] ${expired ? 'opacity-40' : ''}`}>{link.code}</p>
                  <p className="mt-4 text-sm font-medium text-white/70">{expired ? 'Código expirado. Gere um novo.' : `Expira em ${mm}:${ss}`}</p>
                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <a
                      href={link.deep_link}
                      target="_blank"
                      rel="noreferrer"
                      aria-disabled={expired}
                      className={`inline-flex h-12 items-center gap-2 rounded-lg bg-white px-5 font-semibold text-ink transition hover:bg-gray-100 ${expired ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      <Send className="size-5 text-sky-500" /> Abrir Telegram
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(link.code)
                        setCopied(true)
                      }}
                      className="inline-flex h-12 items-center gap-2 rounded-lg bg-white/10 px-5 font-semibold ring-1 ring-white/20 transition hover:bg-white/20"
                    >
                      {copied ? <Check className="size-5" /> : <Copy className="size-5" />} {copied ? 'Copiado' : 'Copiar código'}
                    </button>
                  </div>
                </>
              )}
            </div>

            <ol className="mt-6 grid gap-3">
              {[
                'Toque em "Abrir Telegram" e depois em Iniciar.',
                link ? `Se preferir, envie o código ${link.code} para @${link.bot_username}.` : 'Se preferir, envie o código ao bot do Iron.',
                'Aguarde: esta tela atualiza quando a conta for vinculada.',
              ].map((t, i) => (
                <li key={t} className="flex items-center gap-4 rounded-2xl border border-neutral-200/80 bg-white p-4 text-[15px]">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>

            <div className="mt-8 flex justify-center gap-3">
              <Link to="/app" className={btnDark}>
                Ir para o painel
              </Link>
              <button type="button" onClick={generate} className={btnLight}>
                Gerar novo código
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
