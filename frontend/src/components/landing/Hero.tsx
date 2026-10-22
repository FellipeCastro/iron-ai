import { Dumbbell, TrendingUp } from 'lucide-react'
import image01 from '../../assets/image-01.png'
import image02 from '../../assets/image-02.png'
import { CtaButtons } from './shared'

export function Hero() {
  return (
    <section
      id="top"
      className="relative mx-auto grid max-w-[1440px] grid-cols-1 px-5 pb-12 lg:h-[864px] lg:grid-cols-2 lg:px-[105px] lg:pb-0"
    >
      <div className="pt-6 lg:pt-[125px]">
        <div className="inline-flex h-[43px] items-center gap-2.5 rounded-full border border-neutral-200 bg-white/60 py-1 pr-4 pl-1 lg:pr-5">
          <span className="grid size-[35px] shrink-0 place-items-center rounded-full bg-ink text-white">
            <Dumbbell className="size-[18px]" />
          </span>
          <span className="text-[14px] font-medium lg:text-[15px]">Seu parceiro de treino no Telegram ⚡</span>
        </div>
        <h1 className="mt-[12px] text-[36px] leading-[46px] font-semibold tracking-tight lg:text-[50px] lg:leading-[65px]">
          <span className="font-bold">Conheça o Iron AI</span>
          <br />
          <span className="font-medium">
            Registre seus treinos
            <br />
            só com uma mensagem
          </span>
        </h1>
        <p className="mt-[18px] max-w-[515px] text-base leading-6 text-neutral-500 lg:text-[17px]">
          O agente de IA no Telegram que anota suas séries, corrige na hora e conduz a progressão de carga. Sem
          planilha, sem app extra: você treina, ele cuida do resto.
        </p>
        <div className="mt-6 lg:mt-[14px]">
          <CtaButtons />
        </div>
      </div>

      <div className="relative mt-12 flex items-start justify-center gap-3 lg:mt-0 lg:block">
        <img
          src={image01}
          alt="Conversa com o Iron AI registrando uma série de supino reto"
          className="mt-6 w-[47%] max-w-[260px] -rotate-[3deg] drop-shadow-[0_18px_30px_rgba(0,0,0,0.25)] lg:absolute lg:top-[90px] lg:left-[20px] lg:mt-0 lg:w-[310px] lg:max-w-none"
        />
        <img
          src={image02}
          alt="Lembrete de treino do dia enviado pelo Iron AI"
          className="w-[44%] max-w-[240px] rotate-[4deg] drop-shadow-[0_18px_30px_rgba(0,0,0,0.25)] lg:absolute lg:top-[40px] lg:left-[405px] lg:w-[280px] lg:max-w-none"
        />

        <div className="absolute top-[110px] left-[320px] hidden rounded-xl bg-white px-4 py-2 text-center text-[13px] leading-4 font-semibold shadow-lg [animation:float_5s_ease-in-out_infinite] lg:block">
          Supino reto
          <br />
          25kg
        </div>
        <div className="absolute top-[245px] left-[620px] hidden rounded-xl bg-white px-4 py-2 text-center text-[13px] leading-4 font-semibold shadow-lg [animation:float_6s_ease-in-out_infinite] lg:block">
          1RM
          <br />
          52kg
        </div>
        <div className="absolute top-[180px] left-[255px] hidden items-center gap-1.5 rounded-xl bg-white px-4 py-3 text-[13px] leading-4 font-semibold shadow-lg [animation:float_7s_ease-in-out_infinite] lg:flex">
          <TrendingUp className="size-4 text-emerald-500" />
          +18%
        </div>

        <svg
          className="absolute top-[290px] left-[285px] hidden lg:block"
          width="110"
          height="80"
          viewBox="0 0 110 80"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 28C25 58 55 70 68 55C80 40 62 8 52 12C42 16 55 50 100 62" />
          <path d="M88 52L102 63L84 68" />
        </svg>
      </div>
    </section>
  )
}
