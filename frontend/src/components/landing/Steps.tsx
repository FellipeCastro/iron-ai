const steps = [
  { title: 'Crie sua conta', text: 'Cadastre-se no site em poucos segundos, sem complicação.' },
  {
    title: 'Vincule o Telegram',
    text: 'Gere seu código IRON-XXXX, abra o bot do Iron no Telegram e envie o código. Ele vale por 15 minutos.',
  },
  {
    title: 'Monte seus treinos',
    text: 'Importe os treinos que você já tem ou peça para o Iron gerar uma. Você confirma antes de salvar.',
  },
  {
    title: 'Registre suas séries',
    text: 'Mande exercício, carga e reps. O Iron anota e já define a meta da próxima série. 💪',
  },
  {
    title: 'Veja sua evolução',
    text: 'Veja gráficos de carga, 1RM e volume no site, ou pergunte direto pelo Telegram.',
  },
]

export function Steps() {
  return (
    <section id="como-funciona" className="bg-[#1e1a24] px-5 pt-20 pb-20 lg:px-0 lg:pt-[156px] lg:pb-[160px]">
      <h2 className="text-center text-[32px] leading-[1.2] font-bold tracking-tight text-white lg:text-[48px]">
        Do cadastro ao treino em 5 passos
      </h2>
      <div className="mx-auto mt-10 flex max-w-[1056px] flex-wrap justify-center gap-4 lg:mt-[64px] lg:gap-8">
        {steps.map((s, i) => (
          <article
            key={s.title}
            className={`${i < 3 ? 'lg:min-h-[204px]' : 'lg:min-h-[184px]'} w-full rounded-[20px] border border-white/10 bg-[#2a2630] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.25)] lg:w-[320px] lg:p-7`}
          >
            <div className="flex items-center gap-4">
              <span className="grid size-[42px] shrink-0 place-items-center rounded-full bg-white text-lg font-bold text-ink">
                {i + 1}
              </span>
              <h3 className="text-xl font-medium text-white">{s.title}</h3>
            </div>
            <p className="mt-4 text-sm leading-5 font-medium text-white/80 lg:mt-[22px]">{s.text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
