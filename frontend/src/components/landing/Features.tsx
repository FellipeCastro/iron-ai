import { Clock, Sparkles, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import image01 from '../../assets/image-01.png'
import image02 from '../../assets/image-02.png'
import image03 from '../../assets/image-03.png'
import image04 from '../../assets/image-04.png'

const features = [
  {
    title: 'Registre e corrija séries conversando',
    text: 'Mande a série do seu jeito, como “supino reto 1 série 10kg”. O Iron entende, anota e confirma na hora. Errou? É só dizer “errei, foi 25kg”.',
    image: image01,
  },
  {
    title: 'Receba o treino do dia com as metas',
    text: 'Sua rotina A→B→C gira sozinha. O Iron sabe qual é o próximo treino e envia exercícios, séries, reps e carga alvo de cada um.',
    image: image02,
  },
  {
    title: 'Evolução completa de carga, 1RM e volume',
    text: 'Pergunte “evolução no supino reto” e veja gráficos, 1RM estimado e volume total, com o resumo de cada sessão e o quanto você já progrediu.',
    image: image03,
  },
  {
    title: 'Lembretes no horário certo, sem insistência',
    text: 'Defina o horário e o Iron avisa nos dias de treino com as metas por série. Se você já treinou naquele dia, ele não incomoda.',
    image: image04,
  },
]

export function Features() {
  const [active, setActive] = useState(0)

  return (
    <section id="recursos" className="mx-auto max-w-[1440px] px-5 pt-[88px] lg:px-20 lg:pt-[235px]">
      <h2 className="text-center text-[32px] leading-[1.2] font-medium tracking-tight lg:text-[48px]">O que o Iron AI inclui?</h2>
      <div className="mt-10 grid grid-cols-1 items-start lg:mt-[68px] lg:grid-cols-[1fr_1fr]">
        <div className="hidden flex-col items-center pt-0 pl-[2px] lg:flex">
          <img src={features[active].image} alt="" className="h-[712px] w-auto max-w-full object-contain drop-shadow-xl" />
          <div className="mt-[22px] flex gap-2.5">
            {features.map((f, i) => (
              <button
                key={f.title}
                type="button"
                aria-label={`Ver recurso ${i + 1}`}
                onClick={() => setActive(i)}
                className={`size-3 rounded-full transition ${i === active ? 'bg-slate-800' : 'bg-slate-300'}`}
              />
            ))}
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-4 pl-[2px] lg:mt-0 lg:gap-6 lg:pr-[110px]">
          {features.map((f, i) => (
            <button
              key={f.title}
              type="button"
              onClick={() => setActive(i)}
              className={`rounded-2xl border p-5 text-left transition-all duration-300 lg:p-6 ${
                i === active
                  ? 'z-10 mr-0 border-neutral-800 bg-gray-100 lg:scale-[1.05] lg:px-[26px]'
                  : 'border-neutral-200/80 bg-white lg:mx-[14px]'
              }`}
            >
              <h3 className="text-xl leading-7 font-semibold">{f.title}</h3>
              <p className="mt-3 text-base leading-[25px] text-neutral-500">{f.text}</p>
              {i === active && <img src={f.image} alt="" className="mx-auto mt-5 h-[440px] w-auto max-w-full object-contain lg:hidden" />}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

const reasons = [
  {
    icon: Clock,
    tint: 'text-slate-800',
    title: 'Economize tempo',
    text: 'Sem planilhas e sem abrir app. Uma mensagem e a série está registrada, com data, carga e reps. Seu treino segue no ritmo.',
  },
  {
    icon: Sparkles,
    tint: 'text-pink-500',
    title: 'Progressão automática',
    text: 'O Iron define a meta de cada série: bateu a meta, sobe 1 rep até 12. Com 12 reps, volta para 8 e soma carga.',
  },
  {
    icon: TrendingUp,
    tint: 'text-emerald-600',
    title: 'Evolução sem esforço',
    text: 'Acompanhe carga, 1RM estimado e volume total no WhatsApp e no site, e veja seu progresso semana a semana.',
  },
]

export function WhyIron() {
  return (
    <section className="mx-auto max-w-[1440px] px-5 pt-20 lg:px-20 lg:pt-[233px]">
      <h2 className="text-center text-[32px] leading-[1.2] font-medium tracking-tight lg:text-[48px]">Por que escolher o Iron AI?</h2>
      <p className="mt-3 text-center text-base">O Iron é o jeito mais simples de registrar seu treino.</p>
      <div className="mx-auto mt-10 grid max-w-[1120px] grid-cols-1 gap-4 lg:mt-[80px] lg:grid-cols-3 lg:gap-8">
        {reasons.map((r) => (
          <article key={r.title} className="rounded-[32px] bg-white p-6 pb-8 shadow-[0_4px_30px_rgba(0,0,0,0.04)] lg:p-8 lg:pb-10">
            <span className={`grid size-16 place-items-center rounded-2xl bg-gray-100 ${r.tint}`}>
              <r.icon className="size-7" />
            </span>
            <h3 className="mt-[22px] text-xl leading-7 font-semibold">{r.title}</h3>
            <p className="mt-3 text-[15px] leading-5 text-neutral-500">{r.text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
