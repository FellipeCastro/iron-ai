type Card = {
  title: string
  text: string
  height: number
  stat: string
  statLabel: string
}

const columns: Card[][] = [
  [
    {
      title: 'Registre séries',
      text: 'Mande “supino reto 1 série 10kg” e o Iron anota na hora.',
      height: 543,
      stat: '10kg',
      statLabel: 'supino reto · 1 série',
    },
    {
      title: 'Treinos em sequência',
      text: 'Seus treinos A→B→C giram sozinhos e o Iron sempre sabe qual é o próximo. 💪',
      height: 571,
      stat: 'A·B·C',
      statLabel: 'o próximo treino é sempre o certo',
    },
  ],
  [
    {
      title: 'Lembretes de treino',
      text: 'Receba o plano do dia com as metas de cada exercício, no horário que você escolher.',
      height: 571,
      stat: '07:30',
      statLabel: 'seu treino está chegando',
    },
    {
      title: 'Sem planilhas',
      text: 'Seu treino registrado com uma mensagem, direto no seu celular 🔥',
      height: 571,
      stat: '+15kg',
      statLabel: 'de carga em 2 meses',
    },
  ],
  [
    {
      title: 'Acompanhe a evolução',
      text: 'Pergunte “evolução no supino reto” e veja carga, 1RM e volume total.',
      height: 571,
      stat: '+62%',
      statLabel: 'de volume total',
    },
    {
      title: 'Metas por série',
      text: 'Bateu a meta? O Iron sobe as reps e a carga sozinho. 📈',
      height: 571,
      stat: '12 reps',
      statLabel: 'hora de subir a carga',
    },
  ],
]

function ShowcaseCard({ card }: { card: Card }) {
  return (
    <article
      className="relative h-[360px] overflow-hidden rounded-[28px] bg-gradient-to-b from-[#12304a] via-[#0b1823] to-black shadow-[0_10px_30px_rgba(0,0,0,0.12)] lg:h-[var(--card-h)]"
      style={{ '--card-h': `${card.height}px` } as React.CSSProperties}
    >
      <div className="absolute top-16 left-1/2 w-full -translate-x-1/2 text-center text-white lg:top-20">
        <div className="text-[72px] leading-none font-bold tracking-tight text-sky-400 lg:text-[96px]">{card.stat}</div>
        <div className="mt-3 text-lg text-white/70">{card.statLabel}</div>
      </div>
      <div className="absolute inset-x-4 bottom-4 rounded-[20px] border border-white/25 bg-gradient-to-br from-black/50 to-black/30 p-6 pt-5 text-white backdrop-blur-md">
        <svg width="14" height="12" viewBox="0 0 14 12" fill="#4a9dff" aria-hidden="true">
          <path d="M0 0h5v5L3 12H0l2-6H0zM8 0h5v5l-2 7H8l2-6H8z" />
        </svg>
        <h3 className="mt-1.5 text-xl leading-6 font-semibold">{card.title}</h3>
        <p className="mt-1 text-sm leading-5 text-white/85">{card.text}</p>
      </div>
    </article>
  )
}

export function Showcase() {
  return (
    <section className="mx-auto max-w-[1440px] px-5 pt-[18px] lg:px-[96px]">
      <h2 className="text-center text-[32px] leading-[1.2] font-medium tracking-tight lg:text-[50px]">
        Tudo o que você precisa, numa conversa 💬
      </h2>
      <div className="mt-10 grid grid-cols-1 items-start gap-[21px] lg:mt-[161px] lg:grid-cols-3">
        {columns.map((col, i) => (
          <div key={i} className={`flex flex-col gap-[21px] ${i === 1 ? 'lg:-mt-20' : ''}`}>
            {col.map((card) => (
              <ShowcaseCard key={card.title} card={card} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
