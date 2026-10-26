import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { EditDuration } from "@/components/app/edit-duration";
import { Badge, Card, CardTitle, DayBadge, PageHeader } from "@/components/app/ui";
import { ChevronDownIcon } from "@/components/landing/icons";
import { getHistory, type CloseReason, type WorkoutSession } from "@/lib/data";
import { WEEKDAYS, formatDate, formatDuration, formatKcal, formatKg, formatNumber, formatTime } from "@/lib/format";
import { exerciseUrl } from "@/lib/routes";

export const metadata: Metadata = { title: "Histórico" };

const closeLabel: Record<CloseReason, string> = {
  user: "Encerrado por você",
  complete: "Todos os exercícios concluídos",
  inactive: "Encerrado após 90 min sem registros",
};

export default async function HistoryPage() {
  await auth.protect();
  const { timeZone, sessions, weeks, stats } = await getHistory();

  const months = new Map<string, WorkoutSession[]>();
  for (const s of sessions) {
    const label = formatDate(s.startedAt, timeZone, { month: "long", year: "numeric" });
    months.set(label, [...(months.get(label) ?? []), s]);
  }

  return (
    <>
      <PageHeader eyebrow="Histórico" title="Seus treinos" description="Tudo o que você registrou pelo Telegram, treino a treino." />

      <Card className="mt-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <CardTitle title="Frequência" subtitle="Últimas 12 semanas" />
          <dl className="flex flex-wrap gap-8">
            {[
              ["Treinos", String(stats.total)],
              ["Por semana", formatNumber(stats.perWeek)],
              ["Duração média", `${stats.avgMinutes} min`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[13px] text-[#5b5b66]">{label}</dt>
                <dd className="text-[24px] font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-6 overflow-x-auto pb-1">
          {/* Weeks stretch to fill the card, down to phone width. */}
          <div className="grid min-w-[300px] grid-flow-col grid-cols-[auto_repeat(12,minmax(0,1fr))] grid-rows-7 gap-1 sm:gap-1.5">
            {WEEKDAYS.map((d) => (
              <span key={d.iso} className="flex h-6 items-center pr-2 text-[11px] sm:h-9 sm:text-[12px] text-[#8a8a94]">
                {d.short}
              </span>
            ))}
            {weeks.flat().map((cell) => (
              <span
                key={cell.key}
                title={`${formatDate(`${cell.key}T12:00:00Z`, "UTC", { weekday: "short", day: "2-digit", month: "short" })}${cell.letter ? ` · Treino ${cell.letter}` : ""}`}
                className={`flex h-6 items-center justify-center rounded-[6px] text-[10px] font-bold sm:h-9 sm:rounded-[8px] sm:text-[12px] ${
                  cell.future ? "border border-dashed border-[#e5e7eb]" : cell.letter ? "bg-[#3b82f6] text-white" : "bg-[#f1f1f4]"
                }`}
              >
                {cell.letter}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-5 text-[13px] text-[#5b5b66]">
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-[4px] bg-[#3b82f6]" /> Treinou (letra do treino)
          </span>
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-[4px] bg-[#f1f1f4]" /> Sem treino
          </span>
        </div>
      </Card>

      {sessions.length === 0 && (
        <Card className="mt-6 text-center text-[15px] text-[#5b5b66]">Nenhum treino ainda. Registre sua primeira série pelo Telegram.</Card>
      )}

      {[...months].map(([month, list]) => (
        <section key={month} className="mt-10">
          <h2 className="mb-4 text-[18px] font-semibold capitalize">
            {month} <span className="font-normal text-[#8a8a94]">· {list.length} treinos</span>
          </h2>
          <div className="grid gap-3">
            {list.map((s) => (
              <SessionCard key={s.id} session={s} timeZone={timeZone} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function SessionCard({ session: s, timeZone }: { session: WorkoutSession; timeZone: string }) {
  return (
    <details className="group rounded-[24px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-4 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
        <DayBadge letter={s.letter} />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold">{s.title}</p>
          <p className="text-[14px] text-[#5b5b66] capitalize">
            {formatDate(s.startedAt, timeZone, { weekday: "short", day: "2-digit", month: "short" })} · {formatTime(s.startedAt, timeZone)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{formatDuration(s.startedAt, s.endedAt)}</Badge>
          <Badge>{s.setCount} séries</Badge>
          <Badge>{formatKcal(s.calories)}</Badge>
          {s.prCount > 0 && <Badge tone="pr">🏆 {s.prCount} {s.prCount === 1 ? "recorde" : "recordes"}</Badge>}
        </div>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] transition-transform group-open:rotate-180">
          <ChevronDownIcon className="size-3.5" />
        </span>
      </summary>

      <div className="border-t border-[#f1f1f4] px-5 pt-4 pb-5 sm:px-6">
        <ul className="grid gap-3">
          {s.exercises.map((e) => (
            <li key={e.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <Link href={exerciseUrl(e.id)} className="flex items-center gap-2 text-[15px] font-medium hover:underline sm:w-[280px] sm:shrink-0">
                {e.name}
                {e.sets[0]?.isExtra && <Badge tone="blue">extra</Badge>}
              </Link>
              <div className="flex flex-wrap gap-2">
                {e.sets.map((set) => (
                  <span
                    key={set.position}
                    title={set.corrected ? "Série corrigida pelo chat" : undefined}
                    className={`rounded-[10px] px-2.5 py-1 text-[13px] tabular-nums ${set.isPr ? "bg-[#fff7e0] font-semibold text-[#92400e]" : "bg-[#f5f5f8] text-[#3f3f46]"}`}
                  >
                    {formatKg(set.weight)} × {set.reps}
                    {set.isPr && " 🏆"}
                    {set.corrected && <span className="ml-1 text-[#8a8a94]">✎</span>}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[#8a8a94]">
            {closeLabel[s.closeReason]} · calorias estimadas {formatKcal(s.calories)}
          </p>
          <EditDuration sessionId={s.id} minutes={Math.max(1, Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60_000))} />
        </div>
      </div>
    </details>
  );
}
