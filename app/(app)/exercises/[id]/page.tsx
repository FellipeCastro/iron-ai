import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ExerciseChart } from "@/components/app/exercise-chart";
import { ChevronLeftIcon } from "@/components/app/icons";
import { Badge, Card, CardTitle, PageHeader, StatTile } from "@/components/app/ui";
import { getExerciseDetail } from "@/lib/data";
import { MUSCLE_LABEL, formatDate, formatKg, formatNumber, formatSigned } from "@/lib/format";
import { EXERCISES_URL } from "@/lib/routes";

export const metadata: Metadata = { title: "Evolução — Iron AI" };

const REP_RANGE = [8, 9, 10, 11, 12];

export default async function ExercisePage({ params }: PageProps<"/exercises/[id]">) {
  await auth.protect();
  const { id } = await params;
  const data = await getExerciseDetail(id);
  if (!data) notFound();

  const { exercise, summary, record, targets, timeZone } = data;

  return (
    <>
      <Link href={EXERCISES_URL} className="mb-6 inline-flex items-center gap-1 text-[14px] font-medium text-[#5b5b66] hover:text-[#111]">
        <ChevronLeftIcon className="size-4" /> Evolução
      </Link>
      <PageHeader
        eyebrow={MUSCLE_LABEL[exercise.muscleGroup]}
        title={exercise.name}
        description={
          data.dayLetter ? `Faz parte do treino ${data.dayLetter} · ${targets.length} séries` : "Registrado como exercício extra, fora da rotina."
        }
        actions={summary.stagnant ? <Badge tone="warn">⚠️ Sem progresso nos últimos 3 treinos</Badge> : undefined}
      />

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Carga atual"
          value={formatKg(summary.currentWeight)}
          delta={summary.weightChange30d > 0 ? { text: formatSigned(summary.weightChange30d, " kg"), good: true } : undefined}
          hint={summary.weightChange30d > 0 ? "em 30 dias" : "igual há 30 dias"}
        />
        <StatTile label="Recorde" value={`${formatNumber(record.weight)} × ${record.reps}`} hint={`em ${formatDate(record.date, timeZone)}`} />
        <StatTile label="1RM estimado" value={formatKg(data.bestE1rm)} hint="melhor série" />
        <StatTile
          label="Próxima meta"
          value={targets[0] ? `${formatNumber(targets[0].weight)} × ${targets[0].reps}` : "—"}
          hint={targets[0] ? "kg × reps na 1ª série" : "fora da rotina"}
        />
      </div>

      <div className="mt-6">
        <ExerciseChart
          now={data.now}
          points={data.points.map((p) => ({
            t: Date.parse(p.date),
            label: formatDate(p.date, timeZone),
            maxWeight: p.maxWeight,
            bestE1rm: p.bestE1rm,
            volume: p.volume,
          }))}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {targets.length > 0 && (
          <Card>
            <CardTitle title="Metas por série" subtitle="Faixa de 8 a 12 reps. Ao chegar em 12, a carga sobe." />
            <ul className="mt-6 grid gap-4">
              {targets.map((t) => (
                <li key={t.position} className="flex items-center gap-4">
                  <span className="w-8 text-[14px] font-semibold text-[#8a8a94]">S{t.position}</span>
                  <span className="w-[120px] text-[16px] font-semibold tabular-nums">
                    {formatKg(t.weight)} × {t.reps}
                  </span>
                  <div className="flex flex-1 gap-1" aria-label={`${t.reps} de 12 repetições`}>
                    {REP_RANGE.map((r) => (
                      <span key={r} className={`h-2 flex-1 rounded-full ${r <= t.reps ? "bg-[#3b82f6]" : "bg-[#e8eefc]"}`} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className={targets.length ? "" : "lg:col-span-2"}>
          <CardTitle title="Últimos treinos" />
          <ul className="mt-5 grid gap-3">
            {data.recent.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <span className="w-[90px] shrink-0 text-[14px] text-[#5b5b66] capitalize">
                  {formatDate(r.date, timeZone, { weekday: "short", day: "2-digit", month: "short" })}
                </span>
                <div className="flex flex-wrap gap-2">
                  {r.sets.map((s) => (
                    <span
                      key={s.position}
                      className={`rounded-[10px] px-2.5 py-1 text-[13px] tabular-nums ${s.isPr ? "bg-[#fff7e0] font-semibold text-[#92400e]" : "bg-[#f5f5f8] text-[#3f3f46]"}`}
                    >
                      {formatNumber(s.weight)} × {s.reps}
                      {s.isPr && " 🏆"}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
