import { Check, Copy, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/landing/shared'
import { btnDark, btnLight } from '../components/app/ui'

const CODE = 'IRON-7K3Q'
const BOT = 'iron_ai_bot'

export default function LinkTelegram() {
  const [seconds, setSeconds] = useState(15 * 60)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [])

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fffffe] via-[#f8fbf6] to-[#f0f8fe]">
      <header className="mx-auto flex h-20 max-w-[1440px] items-center px-5 lg:px-20">
        <Logo height={36} href="/" />
      </header>
      <main className="mx-auto max-w-[560px] px-5 pt-10 pb-24 lg:pt-[72px]">
        <h1 className="text-center text-[32px] leading-[1.2] font-medium tracking-tight lg:text-[48px]">Vincule o Telegram</h1>
        <p className="mt-3 text-center text-base text-neutral-600">Abra o bot do Iron e envie o código abaixo para conectar sua conta.</p>

        <div className="mt-10 rounded-[32px] bg-[#1e1a24] p-6 text-center text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] lg:p-10">
          <p className="text-sm font-medium text-white/70">Seu código</p>
          <p className="mt-3 text-[44px] leading-none font-bold tracking-[0.12em]">{CODE}</p>
          <p className="mt-4 text-sm font-medium text-white/70">
            {seconds > 0 ? `Expira em ${mm}:${ss}` : 'Código expirado. Gere um novo.'}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={`https://t.me/${BOT}?start=${CODE}`} className="inline-flex h-12 items-center gap-2 rounded-lg bg-white px-5 font-semibold text-ink transition hover:bg-gray-100">
              <Send className="size-5 text-sky-500" /> Abrir Telegram
            </a>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(CODE)
                setCopied(true)
              }}
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-white/10 px-5 font-semibold ring-1 ring-white/20 transition hover:bg-white/20"
            >
              {copied ? <Check className="size-5" /> : <Copy className="size-5" />} {copied ? 'Copiado' : 'Copiar código'}
            </button>
          </div>
        </div>

        <ol className="mt-6 grid gap-3">
          {[
            'Toque em "Abrir Telegram" e depois em Iniciar.',
            `Se preferir, envie o código ${CODE} para @${BOT}.`,
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
          <button type="button" onClick={() => setSeconds(15 * 60)} className={btnLight}>
            Gerar novo código
          </button>
        </div>
      </main>
    </div>
  )
}
