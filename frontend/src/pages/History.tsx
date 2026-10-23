import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Empty, ErrorState, Loading, PageHeader, btnLight } from '../components/app/ui'
import { useSessions } from '../hooks/useData'
import { fmtDate, groupSets } from '../lib/format'

export default function History() {
  const [limit, setLimit] = useState(20)
  const { data, error, refetch } = useSessions(limit)
  const [open, setOpen] = useState<number | null | undefined>(undefined)

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data) return <Loading />
  const expanded = open === undefined ? data[0]?.id : open

  return (
    <>
      <PageHeader title="Histórico de treinos" subtitle="Todos os treinos e séries registradas pelo Telegram." />
      {data.length === 0 ? (
        <Empty title="Nenhum treino registrado ainda">Envie sua primeira série ao Iron no Telegram, por exemplo: supino reto 10 reps 20kg.</Empty>
      ) : (
        <div className="mx-auto mt-10 flex max-w-[820px] flex-col gap-4 lg:mt-[64px]">
          {data.map((s) => {
            const isOpen = expanded === s.id
            return (
              <div
                key={s.id}
                className={`rounded-2xl border transition-all duration-300 ${isOpen ? 'border-neutral-800 bg-gray-100' : 'border-neutral-200/80 bg-white'}`}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : s.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left lg:p-6"
                >
                  <div>
                    <h3 className="text-xl leading-7 font-semibold">
                      {s.workout} {s.focus && <span className="font-normal text-neutral-500">· {s.focus}</span>}
                    </h3>
                    <p className="mt-1 text-base text-neutral-500">
                      {fmtDate(s.date)} · {s.sets.length} séries
                    </p>
                  </div>
                  <ChevronDown className={`size-5 shrink-0 transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="mx-5 mb-5 divide-y divide-neutral-200 rounded-xl bg-white text-[15px] lg:mx-6 lg:mb-6">
                    {groupSets(s.sets).map((g) => (
                      <div key={g.exercise} className="px-4 py-3">
                        <h4 className="font-semibold">{g.exercise}</h4>
                        <ul className="mt-2 space-y-1 text-neutral-500">
                          {g.sets.map((set, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="w-[64px]">{i + 1} Série</span>
                              <span className="font-medium text-ink">
                                {set.reps} x {set.kg}kg
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {data.length >= limit && (
            <button type="button" onClick={() => setLimit(limit + 20)} className={`${btnLight} self-center`}>
              Carregar mais
            </button>
          )}
        </div>
      )}
    </>
  )
}
