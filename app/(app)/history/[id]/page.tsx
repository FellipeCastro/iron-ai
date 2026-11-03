import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { EditDuration } from "@/components/app/edit-duration";
import { EditSetRow } from "@/components/app/edit-set-row";
import { ChevronLeftIcon } from "@/components/app/icons";
import { AddExercise, AddSet, DeleteSession } from "@/components/app/session-edit-tools";
import { Badge, Card, DayBadge } from "@/components/app/ui";
import { getCatalog, getSession } from "@/lib/data";
import { formatDate, formatDuration, formatKcal, formatTime } from "@/lib/format";
import { HISTORY_URL, exerciseUrl } from "@/lib/routes";

export const metadata: Metadata = { title: "Editar treino" };

export default async function EditSessionPage({ params }: PageProps<"/history/[id]">) {
  await auth.protect();
  const { id } = await params;
  const [data, catalog] = await Promise.all([getSession(id), getCatalog()]);
  if (!data) notFound();

  const { session: s, timeZone } = data;
  const present = new Set(s.exercises.map((e) => e.id));
  const addable = catalog.filter((e) => !present.has(e.id));

  return (
    <>
      <Link href={HISTORY_URL} className="mb-6 inline-flex items-center gap-1 text-[14px] font-medium text-[#5b5b66] hover:text-[#111]">
        <ChevronLeftIcon className="size-4" /> Histórico
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <DayBadge letter={s.letter} size="lg" />
        <div>
          <h1 className="text-[28px] leading-[36px] font-semibold tracking-[-0.01em] sm:text-[34px]">{s.title}</h1>
          <p className="text-[15px] text-[#5b5b66] capitalize">
            {formatDate(s.startedAt, timeZone, { weekday: "long", day: "2-digit", month: "long" })} · {formatTime(s.startedAt, timeZone)}
          </p>
        </div>
      </div>

      <Card className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{formatDuration(s.startedAt, s.endedAt)}</Badge>
            <Badge>{s.setCount} séries</Badge>
            <Badge>{formatKcal(s.calories)}</Badge>
            {s.prCount > 0 && <Badge tone="pr">🏆 {s.prCount} {s.prCount === 1 ? "recorde" : "recordes"}</Badge>}
          </div>
          <EditDuration sessionId={s.id} minutes={Math.max(1, Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60_000))} />
        </div>
      </Card>

      <div className="mt-6 grid gap-4">
        {s.exercises.map((e) => (
          <Card key={e.id} className="p-5! sm:p-6!">
            <Link href={exerciseUrl(e.id)} className="inline-flex items-center gap-2 text-[17px] font-semibold hover:underline">
              {e.name}
              {e.sets[0]?.isExtra && <Badge tone="blue">extra</Badge>}
            </Link>
            <div className="mt-4 grid gap-3">
              {e.sets.map((set) => (
                <EditSetRow key={`${set.id}:${set.weight}:${set.reps}`} setId={set.id} position={set.position} weight={set.weight} reps={set.reps} />
              ))}
            </div>
            <div className="mt-4">
              <AddSet sessionId={s.id} exercise={e} last={e.sets.at(-1) ?? { weight: 0, reps: 0 }} />
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <AddExercise sessionId={s.id} catalog={addable} />
        <DeleteSession sessionId={s.id} />
      </div>
    </>
  );
}
