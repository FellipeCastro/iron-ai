import { ArrowRight, ChevronDown } from 'lucide-react'
import { useState } from 'react'

const faqs = [
  {
    q: 'Como eu vinculo meu Telegram ao Iron?',
    a: 'Depois de criar a conta, gere um código IRON-XXXX no site, abra o bot do Iron no Telegram e envie o código. O código é de uso único, vale por 15 minutos e cada conta tem um número.',
  },
  {
    q: 'Como o Iron decide a carga e as repetições da próxima série?',
    a: 'A progressão é por série. Bateu a meta, a meta sobe 1 rep até 12. Com 12 reps, volta para 8 reps e soma carga (5kg por padrão, configurável). Não bateu? A meta se mantém.',
  },
  {
    q: 'Errei o peso de uma série. Consigo corrigir?',
    a: 'Sim. Mande algo como “errei, foi 25kg” e o Iron altera a última série registrada. Se ficar ambíguo, ele confirma com você antes de mudar.',
  },
  {
    q: 'O Iron entendeu meu exercício errado e registrou a série em outro exercício. Como eu resolvo isso, sem perder meu histórico?',
    a: 'Corrija na própria conversa. Quando o nome do exercício é ambíguo, como “supino”, o Iron pede esclarecimento antes de registrar.',
  },
  {
    q: 'Como funcionam os lembretes de treino?',
    a: 'Você escolhe o horário e o Iron avisa nos dias de treino, com as metas de cada exercício. Se você já registrou uma série naquele dia, ele não manda o lembrete.',
  },
  {
    q: 'Posso registrar exercícios que não estão nos meus treinos?',
    a: 'Pode. Exercícios fora dos seus treinos entram como avulsos, sem meta. A meta nasce da primeira série que você registrar.',
  },
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section id="faq" className="px-5 pt-20 pb-12 lg:px-0 lg:pt-[135px] lg:pb-[43px]">
      <h2 className="text-center text-[32px] leading-[1.2] font-medium tracking-tight lg:text-[48px]">Perguntas frequentes</h2>
      <p className="mt-3 text-center text-base">As dúvidas que mais recebemos sobre o Iron.</p>
      <div className="mx-auto mt-[48px] flex max-w-[768px] flex-col gap-3">
        {faqs.map((f, i) => (
          <div key={f.q} className="rounded-3xl bg-white shadow-[0_2px_20px_rgba(0,0,0,0.03)]">
            <button
              type="button"
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? null : i)}
              className="flex min-h-[78px] w-full items-center justify-between gap-6 px-6 py-5 text-left text-[17px] leading-7 font-medium"
            >
              {f.q}
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gray-100">
                <ChevronDown className={`size-4 transition ${open === i ? 'rotate-180' : ''}`} />
              </span>
            </button>
            {open === i && <p className="px-6 pb-6 text-base leading-6 text-neutral-500">{f.a}</p>}
          </div>
        ))}
      </div>
      <div className="mt-[34px] flex justify-center">
        <a
          href="#faq"
          className="inline-flex h-11 items-center gap-2 rounded-full border border-neutral-200 bg-white px-6 text-base font-medium"
        >
          Ver todas as perguntas <ArrowRight className="size-4" />
        </a>
      </div>
    </section>
  )
}
