import { Search } from 'lucide-react'
import { useState } from 'react'
import { ChartCard, MultiLine } from '../components/app/charts'
import { Card, Empty, ErrorState, Loading, PageHeader, Stat } from '../components/app/ui'
import { useExercises, useProgress } from '../hooks/useData'
import { fmtDate, fmtKg, norm, signed } from '../lib/format'

const loadSeries = [{ key: 'kg', name: 'Carga máxima', color: '#f0323c' }]

export default function Progress() {
  const exercises = useExercises()
  const [picked, setPicked] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const exercise = picked ?? exercises.data?.[0] ?? null
  const progress = useProgress(exercise)

  if (exercises.error) return <ErrorState error={exercises.error} onRetry={exercises.refetch} />
  if (!exercises.data) return <Loading />
  if (exercises.data.length === 0) {
    return (
      <>
        <PageHeader title="Seu progresso" subtitle="Carga máxima e recorde de cada exercício." />
        <Empty title="Sem dados por enquanto">Registre séries pelo Telegram e a evolução de cada exercício aparece aqui.</Empty>
      </>
    )
  }

  const matches = exercises.data.filter((e) => norm(e).includes(norm(query)))
  const data = progress.data
  return (
    <>
      <PageHeader title="Seu progresso" subtitle="Carga máxima e recorde de cada exercício." />

      <div className="relative mx-auto mt-8 w-full max-w-[460px]">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Digite o nome do exercício"
          aria-label="Buscar exercício"
          className="h-12 w-full rounded-lg border border-neutral-200 bg-white pr-4 pl-12 text-base outline-none focus:border-neutral-800"
        />
        {open && (
          <ul className="absolute z-10 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-neutral-200/80 bg-white p-2 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            {matches.length === 0 && <li className="px-3 py-2 text-sm text-neutral-500">Nenhum exercício encontrado</li>}
            {matches.map((e) => (
              <li key={e}>
                <button
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    setPicked(e)
                    setQuery('')
                    setOpen(false)
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-[15px] font-medium transition hover:bg-gray-100 ${e === exercise ? 'bg-gray-100' : ''}`}
                >
                  {e}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="mt-10 text-center text-[28px] leading-[1.2] font-semibold tracking-tight lg:mt-[56px] lg:text-[40px]">{exercise}</h2>

      {progress.error ? (
        <ErrorState error={progress.error} onRetry={progress.refetch} />
      ) : progress.loading || !data ? (
        <Loading />
      ) : !data.points.length ? (
        <Empty title="Sem registros deste exercício">Quando você registrar séries dele pelo Telegram, os gráficos aparecem aqui.</Empty>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-4 lg:mt-8 lg:gap-8">
            <Stat
              label="Carga máxima atual"
              value={`${fmtKg(data.points[data.points.length - 1].kg)} kg`}
              hint={data.kg_change ? `${signed(data.kg_change)} kg no período` : undefined}
            />
            {data.record && (
              <Stat
                label="Recorde"
                value={data.record.weight_kg > 0 ? `${fmtKg(data.record.weight_kg)} kg × ${data.record.reps}` : `${data.record.reps} reps`}
                hint={fmtDate(data.record.date)}
              />
            )}
          </div>

          <div className="mt-4 grid gap-4 lg:mt-8 lg:grid-cols-3 lg:gap-8">
            <ChartCard title="Carga máxima por semana" subtitle={`${exercise}, em kg`} legend={loadSeries} className="lg:col-span-2">
              <MultiLine data={data.points} series={loadSeries} />
            </ChartCard>
            {data.rm_estimate !== null && (
              <Card className="flex flex-col justify-center">
                <p className="text-sm font-medium text-neutral-500">Sugestão</p>
                <p className="mt-2 text-[15px] text-neutral-600">Com base no seu melhor desempenho, seu 1RM estimado neste exercício é de</p>
                <p className="mt-2 text-[36px] leading-none font-semibold tracking-tight">{fmtKg(data.rm_estimate)} kg</p>
                <p className="mt-3 text-xs text-neutral-500">Estimativa pela fórmula de Epley; use como referência, não como meta.</p>
              </Card>
            )}
          </div>
        </>
      )}
    </>
  )
}
