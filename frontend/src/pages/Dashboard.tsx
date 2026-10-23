import { Dumbbell, Flame, Send, TrendingUp } from 'lucide-react'
import { useUser } from '@clerk/react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { ChartCard, CountLine, MusclePie, WorkoutBars } from '../components/app/charts'
import { musclePalette } from '../components/app/palette'
import { CalendarGrid, RecordsTable } from '../components/app/metrics'
import { Card, Empty, ErrorState, Loading, PageHeader, Stat, btnLight } from '../components/app/ui'
import { useDashboard, useMe, useRecords, useRoutine, useSessions } from '../hooks/useData'
import { fmtDate, fmtTime } from '../lib/format'

const periods = [1, 2, 3, 6]
const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const monthName = (month: string) => months[Number(month.split('-')[1]) - 1]

export default function Dashboard() {
  const { user } = useUser()
  const me = useMe()
  const [months, setMonths] = useState(2)
  const dash = useDashboard(months)
  // mantém o período anterior na tela enquanto o novo carrega, sem piscar a página inteira
  const [shown, setShown] = useState(dash.data)
  if (dash.data && dash.data !== shown) setShown(dash.data)
  const records = useRecords()
  const routine = useRoutine()
  const sessions = useSessions(3)

  const error = dash.error ?? routine.error ?? sessions.error
  if (error) return <ErrorState error={error} onRetry={() => { dash.refetch(); routine.refetch(); sessions.refetch() }} />
  if (!shown || !routine.data || !sessions.data) return <Loading />

  const { stats, weekly, muscles, by_workout, calendar } = shown
  const period = months === 1 ? 'último mês' : `últimos ${months} meses`
  const muscleLegend = muscles.map((m, i) => ({ name: `${m.name} ${m.pct}%`, color: musclePalette[i % musclePalette.length] }))
  const next = routine.data.workouts.find((w) => w.id === routine.data!.next_workout_id)
  const reminder = fmtTime(routine.data.reminder_time)

  return (
    <>
      <PageHeader
        title={`Olá, ${user?.firstName ?? ''} 👋`}
        subtitle="Registre as séries pelo Telegram e acompanhe tudo por aqui."
      />

      {me.data && !me.data.linked && (
        <Card className="mx-auto mt-8 flex max-w-[720px] flex-wrap items-center justify-between gap-4 !bg-[#1e1a24] text-white">
          <p className="text-[15px]">Seu Telegram ainda não está vinculado. Vincule para começar a registrar seus treinos.</p>
          <Link to="/vincular" className="inline-flex h-12 items-center gap-2 rounded-lg bg-white px-5 font-semibold text-ink">
            <Send className="size-4 text-sky-500" /> Vincular Telegram
          </Link>
        </Card>
      )}

      <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-4 lg:mt-[56px] lg:gap-8">
        <Stat
          label="Dias treinados na semana"
          value={stats.days_planned_week ? `${stats.days_trained_week} de ${stats.days_planned_week}` : String(stats.days_trained_week)}
          hint={stats.streak_weeks ? `${stats.streak_weeks} ${stats.streak_weeks === 1 ? 'semana seguida' : 'semanas seguidas'}` : undefined}
        />
        <Stat
          label="Recordes no mês"
          value={String(stats.records_month)}
          hint={stats.records_month ? 'nos últimos 30 dias' : undefined}
        />
        <Stat
          label="Músculo mais treinado"
          value={stats.top_muscle?.name ?? '—'}
          hint={stats.top_muscle ? `${stats.top_muscle.pct}% das séries` : undefined}
        />
      </div>

      <div role="group" aria-label="Período" className="mt-8 flex justify-center gap-2 lg:mt-12">
        {periods.map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={w === months}
            onClick={() => setMonths(w)}
            className={`h-10 rounded-lg px-4 text-sm font-semibold ring-1 transition ${w === months ? 'bg-ink text-white ring-black' : 'bg-white text-ink ring-neutral-300 hover:bg-gray-100'}`}
          >
            {w === 1 ? '1 mês' : `${w} meses`}
          </button>
        ))}
      </div>

      <div className={`mt-4 grid gap-4 transition-opacity lg:grid-cols-3 lg:gap-8 ${dash.loading ? 'opacity-60' : ''}`}>
        <ChartCard title="Músculos mais trabalhados" subtitle={`Divisão das séries por grupo muscular, ${period}`} legend={muscleLegend} className="lg:col-span-2">
          {muscles.length ? (
            <MusclePie data={muscles} />
          ) : (
            <p className="grid h-full place-items-center text-center text-sm text-neutral-500">Registre séries pelo Telegram para ver os músculos mais trabalhados.</p>
          )}
        </ChartCard>
        <ChartCard title="Treinos por semana" subtitle={`Frequência, ${period}`}>
          <CountLine data={weekly} dataKey="treinos" name="Treinos" />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:mt-8 lg:grid-cols-2 lg:gap-8">
        <ChartCard title="Treinos feitos" subtitle={`Quantas vezes você fez cada treino, ${period}`}>
          {by_workout.length ? (
            <WorkoutBars data={by_workout} />
          ) : (
            <p className="grid h-full place-items-center text-center text-sm text-neutral-500">Sem treinos no período.</p>
          )}
        </ChartCard>
        <ChartCard title="Calendário" subtitle={`Dias treinados em ${monthName(calendar.month)}`}>
          <CalendarGrid month={calendar.month} days={calendar.days} />
        </ChartCard>
      </div>

      <Card className="mt-4 lg:mt-8">
        <h3 className="text-lg font-semibold sm:text-xl">Recordes</h3>
        <p className="text-sm text-neutral-500">Maior carga de cada exercício; em empate, vale quem fez mais reps.</p>
        {records.error ? (
          <p className="mt-4 text-sm text-neutral-500">{records.error.message}</p>
        ) : !records.data ? (
          <Loading />
        ) : records.data.length ? (
          <div className="mt-4">
            <RecordsTable records={records.data} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-neutral-500">Registre séries pelo Telegram para ver seus recordes.</p>
        )}
      </Card>

      <section className="mt-16 lg:mt-[96px]">
        <h2 className="text-center text-[28px] leading-[1.2] font-medium tracking-tight lg:text-[40px]">Próximo treino</h2>
        {next ? (
          <div className="mx-auto mt-10 rounded-[32px] bg-[#1e1a24] p-6 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] lg:p-10">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="grid size-[48px] place-items-center rounded-full bg-white text-xl font-bold text-ink">{next.letter}</span>
                <div>
                  <h3 className="text-2xl font-medium">{next.name}</h3>
                  <p className="text-sm text-white/70">{next.focus}</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium">
                <Send className="size-4 text-sky-400" /> {reminder ? `Lembrete às ${reminder}` : 'Lembrete desativado'}
              </span>
            </div>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {next.exercises.map((e) => (
                <article key={e.exercise_id} className="rounded-[20px] border border-white/10 bg-[#2a2630] p-5">
                  <h4 className="text-lg font-medium">{e.name}</h4>
                  <p className="text-xs text-white/60">{e.group}</p>
                  <ul className="mt-4 space-y-2 text-sm font-medium text-white/80">
                    {e.targets.map((t) => (
                      <li key={t.set} className="flex justify-between">
                        <span>{t.set} Série</span>
                        <span>{t.reps !== null ? `${t.reps} x ${t.kg}kg` : 'meta na 1ª vez'}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <Empty title="Você ainda não tem uma rotina">Peça ao Iron no Telegram para montar ou importar sua rotina. Ele resume e você confirma antes de salvar.</Empty>
        )}
      </section>

      <section className="mt-16 lg:mt-[96px]">
        <h2 className="text-center text-[28px] leading-[1.2] font-medium tracking-tight lg:text-[40px]">Últimos treinos</h2>
        {sessions.data.length === 0 ? (
          <Empty title="Nenhum treino registrado ainda">Envie sua primeira série ao Iron no Telegram, por exemplo: supino reto 10 reps 20kg.</Empty>
        ) : (
          <>
            <div className="mt-10 grid gap-4 lg:grid-cols-3 lg:gap-8">
              {sessions.data.map((s, i) => (
                <Card key={s.id} className="!p-6">
                  <span className="grid size-14 place-items-center rounded-2xl bg-gray-100">
                    {[<Dumbbell key="d" className="size-6" />, <Flame key="f" className="size-6 text-pink-500" />, <TrendingUp key="t" className="size-6 text-emerald-600" />][i % 3]}
                  </span>
                  <h3 className="mt-5 text-xl font-semibold">{s.workout}</h3>
                  <p className="mt-1 text-[15px] text-neutral-500">
                    {fmtDate(s.date)} · {s.sets.length} séries
                  </p>
                </Card>
              ))}
            </div>
            <div className="mt-8 flex justify-center">
              <Link to="/app/historico" className={btnLight}>
                Ver histórico completo
              </Link>
            </div>
          </>
        )}
      </section>
    </>
  )
}
