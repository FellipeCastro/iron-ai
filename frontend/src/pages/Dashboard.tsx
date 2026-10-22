import { Dumbbell, Flame, Send, TrendingUp } from 'lucide-react'
import { useUser } from '@clerk/react'
import { Link } from 'react-router-dom'
import { ChartCard, MultiLine, VolumeArea, VolumeBars } from '../components/app/charts'
import { Card, Empty, ErrorState, Loading, PageHeader, Stat, btnLight } from '../components/app/ui'
import { useDashboard, useMe, useRoutine, useSessions } from '../hooks/useData'
import { fmtDate, fmtTime, fmtVolume, signed } from '../lib/format'

const palette = ['#0a0a0a', '#f0323c', '#059669']

export default function Dashboard() {
  const { user } = useUser()
  const me = useMe()
  const dash = useDashboard()
  const routine = useRoutine()
  const sessions = useSessions(3)

  const error = dash.error ?? routine.error ?? sessions.error
  if (error) return <ErrorState error={error} onRetry={() => { dash.refetch(); routine.refetch(); sessions.refetch() }} />
  if (!dash.data || !routine.data || !sessions.data) return <Loading />

  const { stats, weekly, one_rm } = dash.data
  const next = routine.data.workouts.find((w) => w.id === routine.data!.next_workout_id)
  const reminder = fmtTime(routine.data.reminder_time)
  const oneRmSeries = one_rm.series.map((s, i) => ({ key: s.key, name: s.name, color: palette[i % palette.length] }))

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
          label="Treinos no mês"
          value={String(stats.workouts_month)}
          hint={stats.workouts_month_change !== 0 ? `${signed(stats.workouts_month_change)} vs mês anterior` : undefined}
        />
        <Stat
          label="Volume na semana"
          value={fmtVolume(stats.volume_week)}
          hint={stats.volume_week_change_pct !== null ? `${signed(stats.volume_week_change_pct, '%')} vs semana anterior` : undefined}
        />
        <Stat
          label="Sequência"
          value={`${stats.streak_weeks} ${stats.streak_weeks === 1 ? 'semana' : 'semanas'}`}
          hint={`Recorde: ${stats.streak_record_weeks}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:mt-8 lg:grid-cols-3 lg:gap-8">
        <ChartCard title="Volume semanal" subtitle="Total levantado em kg (reps x carga)" legend={[{ name: 'Volume', color: '#1e1a24' }]} className="lg:col-span-2">
          <VolumeArea data={weekly} />
        </ChartCard>
        <ChartCard title="Treinos por semana" subtitle="Frequência" legend={[{ name: 'Treinos', color: '#1e1a24' }]}>
          <VolumeBars data={weekly} dataKey="treinos" name="Treinos" unit="" />
        </ChartCard>
      </div>
      <div className="mt-4 lg:mt-8">
        <ChartCard title="Evolução do 1RM" subtitle="Estimado pela fórmula de Epley, em kg" legend={oneRmSeries}>
          {oneRmSeries.length ? (
            <MultiLine data={one_rm.data} series={oneRmSeries} />
          ) : (
            <p className="grid h-full place-items-center text-center text-sm text-neutral-500">Registre séries pelo Telegram para ver a evolução do 1RM.</p>
          )}
        </ChartCard>
      </div>

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
                  <p className="mt-3 text-[15px] text-neutral-500">Volume total de {s.volume.toLocaleString('pt-BR')} kg.</p>
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
