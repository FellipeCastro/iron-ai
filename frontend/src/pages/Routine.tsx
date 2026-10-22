import { useState } from 'react'
import { Empty, ErrorState, Loading, PageHeader, Panel } from '../components/app/ui'
import { useRoutine } from '../hooks/useData'

export default function Routine() {
  const { data, error, refetch } = useRoutine()
  const [picked, setPicked] = useState<number | null>(null)

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data) return <Loading />
  if (data.workouts.length === 0) {
    return (
      <>
        <PageHeader title="Seus treinos" />
        <Empty title="Você ainda não tem uma rotina">Peça ao Iron no Telegram para montar ou importar sua rotina. Ele resume e você confirma antes de salvar.</Empty>
      </>
    )
  }

  const active = picked ?? data.next_workout_id ?? data.workouts[0].id
  const current = data.workouts.find((w) => w.id === active) ?? data.workouts[0]
  return (
    <>
      <PageHeader title="Seus treinos" subtitle="Sequência rotativa A → B → C. O próximo treino é sempre o seguinte ao último concluído." />

      <div className="mt-10 grid items-start gap-6 lg:mt-[64px] lg:grid-cols-[1fr_1.6fr] lg:gap-8">
        <div className="flex flex-col gap-4 lg:gap-6">
          {data.workouts.map((w) => (
            <button key={w.id} type="button" onClick={() => setPicked(w.id)} className="text-left">
              <Panel active={w.id === current.id} className="transition-all duration-300">
                <div className="flex items-center gap-4">
                  <span
                    className={`grid size-[42px] shrink-0 place-items-center rounded-full text-lg font-bold ${
                      w.id === current.id ? 'bg-ink text-white' : 'bg-gray-100 text-ink'
                    }`}
                  >
                    {w.letter}
                  </span>
                  <div>
                    <h3 className="text-xl leading-7 font-semibold">{w.name}</h3>
                    <p className="text-base text-neutral-500">
                      {w.focus ? `${w.focus} · ` : ''}
                      {w.exercises.length} exercícios
                    </p>
                  </div>
                </div>
                {w.id === data.next_workout_id && <p className="mt-3 text-sm font-medium text-emerald-600">Próximo treino</p>}
              </Panel>
            </button>
          ))}
        </div>

        <div className="rounded-[32px] bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.04)] lg:p-8">
          <h2 className="text-2xl font-semibold">
            {current.name} {current.focus && <span className="font-normal text-neutral-500">· {current.focus}</span>}
          </h2>
          <div className="mt-6 divide-y divide-neutral-200/80">
            {current.exercises.map((e) => (
              <div key={e.exercise_id} className="py-5 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-lg font-semibold">{e.name}</h3>
                  {e.group && <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-neutral-600">{e.group}</span>}
                </div>
                <ul className="mt-3 space-y-1.5 text-[15px]">
                  {e.targets.map((t) => (
                    <li key={t.set} className="flex gap-2 rounded-lg bg-gray-100 px-3 py-2 font-medium">
                      <span className="w-[64px] text-neutral-500">{t.set} Série</span>
                      <span>{t.reps !== null ? `${t.reps} x ${t.kg}kg` : 'meta definida na primeira série'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-neutral-500">Para alterar seus treinos, peça ao Iron no Telegram. Ele resume e você confirma antes de salvar.</p>
        </div>
      </div>
    </>
  )
}
