import { Dumbbell, Flame, Send, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ChartCard, MultiLine, VolumeArea, VolumeBars } from '../components/app/charts'
import { Card, PageHeader, Stat, btnLight } from '../components/app/ui'
import { nextWorkoutId, oneRmByExercise, sessions, user, weeklyOverview, workouts } from '../lib/mock'

const oneRmSeries = [
  { key: 'supino', name: 'Supino reto', color: '#0a0a0a' },
  { key: 'puxada', name: 'Puxada frontal', color: '#f0323c' },
  { key: 'agachamento', name: 'Agachamento', color: '#059669' },
]

export default function Dashboard() {
  const next = workouts.find((w) => w.id === nextWorkoutId)!
  return (
    <>
      <PageHeader
        title={`Olá, ${user.name.split(' ')[0]} 👋`}
        subtitle="Seu próximo treino já está pronto. Registre as séries pelo Telegram e acompanhe tudo por aqui."
      />

      <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-4 lg:mt-[56px] lg:gap-8">
        <Stat label="Treinos" value="12" hint="+3 no mês" />
        <Stat label="Volume" value="21,4 t" hint="+8%" />
        <Stat label="Sequência" value="5 dias" hint="Recorde: 9" />
      </div>

      <div className="mt-4 grid gap-4 lg:mt-8 lg:grid-cols-3 lg:gap-8">
        <ChartCard title="Volume semanal" subtitle="Total levantado em kg (reps x carga)" legend={[{ name: 'Volume', color: '#1e1a24' }]} className="lg:col-span-2">
          <VolumeArea data={weeklyOverview} />
        </ChartCard>
        <ChartCard title="Treinos por semana" subtitle="Frequência" legend={[{ name: 'Treinos', color: '#1e1a24' }]}>
          <VolumeBars data={weeklyOverview} dataKey="treinos" name="Treinos" unit="" />
        </ChartCard>
      </div>
      <div className="mt-4 lg:mt-8">
        <ChartCard title="Evolução do 1RM" subtitle="Estimado pela fórmula de Epley, em kg" legend={oneRmSeries}>
          <MultiLine data={oneRmByExercise} series={oneRmSeries} />
        </ChartCard>
      </div>

      <section className="mt-16 lg:mt-[96px]">
        <h2 className="text-center text-[28px] leading-[1.2] font-medium tracking-tight lg:text-[40px]">Próximo treino</h2>
        <div className="mx-auto mt-10 rounded-[32px] bg-[#1e1a24] p-6 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] lg:p-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="grid size-[48px] place-items-center rounded-full bg-white text-xl font-bold text-ink">{next.id}</span>
              <div>
                <h3 className="text-2xl font-medium">{next.name}</h3>
                <p className="text-sm text-white/70">{next.focus}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium">
              <Send className="size-4 text-sky-400" /> Lembrete às 18:00
            </span>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {next.exercises.map((e) => (
              <article key={e.name} className="rounded-[20px] border border-white/10 bg-[#2a2630] p-5">
                <h4 className="text-lg font-medium">{e.name}</h4>
                <p className="text-xs text-white/60">{e.group}</p>
                <ul className="mt-4 space-y-2 text-sm font-medium text-white/80">
                  {e.targets.map((t) => (
                    <li key={t.set} className="flex justify-between">
                      <span>{t.set} Série</span>
                      <span>
                        {t.reps} x {t.kg}kg
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-16 lg:mt-[96px]">
        <h2 className="text-center text-[28px] leading-[1.2] font-medium tracking-tight lg:text-[40px]">Últimos treinos</h2>
        <div className="mt-10 grid gap-4 lg:grid-cols-3 lg:gap-8">
          {sessions.slice(0, 3).map((s, i) => (
            <Card key={s.id} className="!p-6">
              <span className="grid size-14 place-items-center rounded-2xl bg-gray-100">
                {[<Dumbbell key="d" className="size-6" />, <Flame key="f" className="size-6 text-pink-500" />, <TrendingUp key="t" className="size-6 text-emerald-600" />][i]}
              </span>
              <h3 className="mt-5 text-xl font-semibold">{s.workout}</h3>
              <p className="mt-1 text-[15px] text-neutral-500">
                {s.date} · {s.sets.length} séries
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
      </section>
    </>
  )
}
