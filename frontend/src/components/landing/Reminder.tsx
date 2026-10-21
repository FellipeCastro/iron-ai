import image04 from '../../assets/image-04.png'

export function Reminder() {
  return (
    <section
      id="lembretes"
      className="relative mx-auto max-w-[1440px] overflow-hidden px-5 py-20 lg:h-[965px] lg:px-20 lg:py-0"
    >
      <div className="lg:absolute lg:top-[274px] lg:left-[144px]">
        <p className="text-sm font-medium tracking-[0.06em] text-accent">LEMBRETE DIÁRIO</p>
        <h2 className="mt-[22px] text-[34px] leading-[42px] font-bold tracking-tight text-slate-800 lg:text-[48px] lg:leading-[60px]">
          Seu plano do dia
          <br />
          chega no WhatsApp
          <br />
          na hora certa! ⏰💪
        </h2>
        <p className="mt-[22px] text-lg text-neutral-500">Sem abrir app nenhum :)</p>
      </div>
      <div className="mx-auto mt-12 w-[260px] -rotate-[3deg] lg:absolute lg:top-[60px] lg:left-[968px] lg:mx-0 lg:mt-0 lg:w-[360px]">
        <img
          src={image04}
          alt="Lembrete de treino com as metas do dia no WhatsApp"
          className="w-full rounded-[36px] shadow-[0_30px_60px_rgba(0,0,0,0.12)] lg:rounded-[48px]"
        />
      </div>
    </section>
  )
}
