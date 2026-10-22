import { Search } from 'lucide-react'
import { useState } from 'react'
import { ChartCard, MultiLine, VolumeBars } from '../components/app/charts'
import { Empty, ErrorState, Loading, PageHeader, Stat } from '../components/app/ui'
import { useExercises, useProgress } from '../hooks/useData'
import { fmtKg, fmtVolume, signed } from '../lib/format'

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const loadSeries = [
  { key: 'rm', name: '1RM', color: '#0a0a0a' },
  { key: 'kg', name: 'Carga', color: '#f0323c', step: true },
]

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
        <PageHeader title="Seu progresso" subtitle="Carga, 1RM estimado (Epley) e volume total por exercício." />
        <Empty title="Sem dados por enquanto">Registre séries pelo Telegram e a evolução de cada exercício aparece aqui.</Empty>
      </>
    )
  }

  const matches = exercises.data.filter((e) => norm(e).includes(norm(query)))
  const summary = progress.data?.summary
  return (
    <>
      <PageHeader title="Seu progresso" subtitle="Carga, 1RM estimado (Epley) e volume total por exercício." />

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
      ) : progress.loading || !progress.data ? (
        <Loading />
      ) : !summary ? (
        <Empty title="Sem registros deste exercício">Quando você registrar séries dele pelo Telegram, os gráficos aparecem aqui.</Empty>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4 lg:mt-8 lg:gap-8">
            <Stat label="Carga" value={`${fmtKg(summary.kg)} kg`} hint={summary.kg_change ? `${signed(summary.kg_change)} kg` : undefined} />
            <Stat label="1RM" value={`${fmtKg(summary.rm)} kg`} hint={summary.rm_change ? `${signed(summary.rm_change)} kg` : undefined} />
            <Stat
              label="Volume"
              value={fmtVolume(summary.volume)}
              hint={summary.volume_change_pct !== null && summary.volume_change_pct !== 0 ? signed(summary.volume_change_pct, '%') : undefined}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:mt-8 lg:grid-cols-2 lg:gap-8">
            <ChartCard title="Carga e 1RM" subtitle={`${exercise}, em kg`} legend={loadSeries}>
              <MultiLine data={progress.data.points} series={loadSeries} />
            </ChartCard>
            <ChartCard title="Volume por semana" subtitle={`${exercise}, reps x kg`} legend={[{ name: 'Volume', color: '#1e1a24' }]}>
              <VolumeBars data={progress.data.points} />
            </ChartCard>
          </div>
        </>
      )}
    </>
  )
}
