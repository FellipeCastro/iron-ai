import type { Metadata } from "next";
import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { Badge, Card, CardTitle, DayBadge, PageHeader, StatTile, buttonPrimary } from "@/components/app/ui";
import { BarChart } from "@/components/charts/bar-chart";
import { ArrowRightIcon, TelegramColorIcon } from "@/components/landing/icons";
import { getDashboard } from "@/lib/data";
import { formatCompact, formatDuration, formatKg, formatRelativeDay, formatSigned } from "@/lib/format";
import { HISTORY_URL, ROUTINE_URL, SETTINGS_URL, exerciseUrl } from "@/lib/routes";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage() {
  await auth.protect();
  const [user, data] = await Promise.all([currentUser(), getDashboard()]);
  const now = new Date(data.now);
  const { nextDay, stats, week, lastSession, telegram } = data;
  const totalSets = nextDay?.exercises.reduce((sum, e) => sum + e.plannedSets, 0) ?? 0;
  const caloriesDelta = stats.caloriesPrev7d ? Math.round(((stats.calories7d - stats.caloriesPrev7d) / stats.caloriesPrev7d) * 100) : null;
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  const botUrl = botUsername ? `https://t.me/${botUsername}` : null;
  const monthDelta = stats.sessionsThisMonth - stats.sessionsPrevMonth;

  return (
    <>
      <PageHeader
        eyebrow="Painel"
        title={`Olá${user?.firstName ? `, ${user.firstName}` : ""} 👋`}
        description={
          !nextDay
            ? "Monte sua rotina para começar a registrar pelo Telegram."
            : data.isTrainingDay
              ? `Hoje é dia de treino.${data.reminderTime ? ` Avisamos no Telegram às ${data.reminderTime}.` : ""}`
              : `Hoje é dia de descanso. O próximo treino é o ${nextDay.letter}.`
        }
      />

      <Link
        href={telegram.connected && botUrl ? botUrl : SETTINGS_URL}
        {...(telegram.connected && botUrl ? { target: "_blank", rel: "noreferrer" } : {})}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[14px] font-medium shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-opacity hover:opacity-80"
      >
        <TelegramColorIcon className="size-5" />
        {telegram.connected ? (
          <>
            Telegram conectado
            {telegram.username?.startsWith("@") ? ` · ${telegram.username}` : ""}
            <span className="text-[#5b5b66]">— abrir conversa</span>
          </>
        ) : (
          "Conectar Telegram"
        )}
        <ArrowRightIcon className="size-4" />
      </Link>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Next workout */}
        {!nextDay ? (
          <section className="rounded-[28px] bg-[#1e1a24] p-6 text-white shadow-[0_10px_30px_rgba(0,0,0,0.12)] sm:p-8 lg:col-span-2">
            <p className="text-[13px] font-medium tracking-[0.08em] text-white/60 uppercase">Primeiro passo</p>
            <h2 className="mt-2 text-[24px] font-semibold">Monte sua rotina</h2>
            <p className="mt-3 max-w-[520px] text-[15px] text-white/70">
              Escolha os treinos do rodízio (A, B, C…) e os exercícios de cada um. Você também pode mandar a rotina direto no Telegram.
            </p>
            <Link href={ROUTINE_URL} className={`${buttonPrimary} mt-6 bg-white text-[#111]!`}>
              Montar rotina <ArrowRightIcon className="size-4" />
            </Link>
          </section>
        ) : (
          <section className="rounded-[28px] bg-[#1e1a24] p-6 text-white shadow-[0_10px_30px_rgba(0,0,0,0.12)] sm:p-8 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-white text-[24px] font-bold text-[#1e1a24]">
                  {nextDay.letter}
                </span>
                <div>
                  <p className="text-[13px] font-medium tracking-[0.08em] text-white/60 uppercase">Próximo treino</p>
                  <h2 className="text-[24px] font-semibold">{nextDay.title}</h2>
                </div>
              </div>
              <p className="text-[14px] text-white/70">
                {nextDay.exercises.length} exercícios · {totalSets} séries
              </p>
            </div>

            <ul className="mt-6 grid gap-2">
              {nextDay.exercises.map((e) => {
                const target = e.targets[0];
                return (
                  <li key={e.id}>
                    <Link
                      href={exerciseUrl(e.id)}
                      className="flex items-center justify-between gap-4 rounded-[14px] border border-white/10 bg-[#2d2935] px-4 py-3 transition-colors hover:bg-[#37323f]"
                    >
                      <span className="min-w-0 truncate text-[15px] font-medium">{e.name}</span>
                      <span className="shrink-0 text-[14px] text-white/70">
                        {e.plannedSets}× ·{" "}
                        {target ? (
                          <>
                            meta{" "}
                            <span className="font-semibold text-white">
                              {formatKg(target.weight)} × {target.reps}
                            </span>
                          </>
                        ) : (
                          "meta na 1ª vez"
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5" aria-hidden>
                  {Array.from({ length: Math.max(week.planned, week.done) }, (_, i) => (
                    <span key={i} className={`h-2 w-8 rounded-full ${i < week.done ? "bg-[#2AABEE]" : "bg-white/15"}`} />
                  ))}
                </div>
                <span className="text-[14px] text-white/80">
                  Esta semana: {week.done} de {week.planned} treinos
                </span>
              </div>
              <Link href={ROUTINE_URL} className="inline-flex items-center gap-2 text-[14px] font-semibold hover:opacity-80">
                Ver rotina <ArrowRightIcon className="size-4" />
              </Link>
            </div>
          </section>
        )}

        <div className="grid gap-6">
          {/* Last workout */}
          <Card>
            <CardTitle
              title="Último treino"
              action={
                <Link href={HISTORY_URL} className="text-[14px] font-semibold hover:opacity-70">
                  Histórico
                </Link>
              }
            />
            {lastSession ? (
              <div className="mt-4 flex items-center gap-4">
                <DayBadge letter={lastSession.letter} />
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold">{lastSession.title}</p>
                  <p className="text-[14px] text-[#5b5b66]">
                    {formatRelativeDay(lastSession.startedAt, now, data.timeZone)} · {formatDuration(lastSession.startedAt, lastSession.endedAt)} ·{" "}
                    {lastSession.setCount} séries
                  </p>
                </div>
                {lastSession.prCount > 0 && (
                  <span className="ml-auto">
                    <Badge tone="pr">🏆 {lastSession.prCount}</Badge>
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-4 text-[14px] text-[#5b5b66]">Nenhum treino registrado ainda.</p>
            )}
          </Card>

          <Card>
            <CardTitle title="Destaques" subtitle="Recordes recentes e pontos de atenção" />
            <ul className="mt-5 grid gap-3">
              {data.recentPrs.map((pr) => (
                <li key={pr.id}>
                  <Link href={exerciseUrl(pr.id)} className="flex items-center gap-3 rounded-[14px] px-1 py-1 hover:bg-[#f9f9fb]">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#fff7e0] text-[18px]" aria-hidden>
                      🏆
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">{pr.name}</span>
                      <span className="text-[13px] text-[#5b5b66]">
                        {formatKg(pr.weight)} × {pr.reps} · {formatRelativeDay(pr.date, now, data.timeZone)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
              {data.stagnant.map((e) => (
                <li key={e.id}>
                  <Link href={exerciseUrl(e.id)} className="flex items-center gap-3 rounded-[14px] px-1 py-1 hover:bg-[#f9f9fb]">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#fff1f3] text-[18px]" aria-hidden>
                      ⚠️
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">{e.name}</span>
                      <span className="text-[13px] text-[#be123c]">Sem progresso nos últimos 3 treinos</span>
                    </span>
                  </Link>
                </li>
              ))}
              {data.recentPrs.length === 0 && data.stagnant.length === 0 && (
                <li className="text-[14px] text-[#5b5b66]">Seus recordes aparecem aqui conforme você treina.</li>
              )}
            </ul>
          </Card>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        <StatTile
          label="Treinos neste mês"
          value={String(stats.sessionsThisMonth)}
          hint={`${stats.sessionsPrevMonth} no mês passado`}
          delta={monthDelta !== 0 ? { text: formatSigned(monthDelta), good: monthDelta > 0 } : undefined}
        />
        <StatTile
          label="Calorias em 7 dias"
          value={`~${formatCompact(Math.round(stats.calories7d))} kcal`}
          hint="vs. 7 dias anteriores"
          delta={
            caloriesDelta !== null
              ? {
                  text: formatSigned(caloriesDelta, "%"),
                  good: caloriesDelta === 0 ? null : caloriesDelta > 0,
                }
              : undefined
          }
        />
        <StatTile label="Cargas aumentadas em 30 dias" value={String(stats.loadUps30d)} hint={`de ${stats.trackedExercises} exercícios da rotina`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardTitle title="Calorias por semana" subtitle="Estimativa das calorias gastas nos treinos. A barra clara é a semana atual." />
          <div className="mt-6">
            <BarChart
              label="Calorias estimadas por semana nas últimas 8 semanas"
              unit="kcal"
              data={data.weeklyCalories.map((w) => ({
                label: w.label,
                value: w.value,
                detail: w.detail,
                muted: w.current,
              }))}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
