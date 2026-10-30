import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { RoutineEditor } from "@/components/app/routine-editor";
import { CalendarIcon, TrendIcon } from "@/components/app/icons";
import { PageHeader } from "@/components/app/ui";
import { getCatalog, getRoutine } from "@/lib/data";
import { EXERCISES_URL, HISTORY_URL } from "@/lib/routes";

export const metadata: Metadata = { title: "Rotina" };

const LINK_CLASS = "inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[15px] font-medium shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#f3f4f6]";

export default async function RoutinePage() {
  await auth.protect();
  const [routine, catalog] = await Promise.all([getRoutine(), getCatalog()]);

  return (
    <>
      <div>
        <PageHeader
          eyebrow="Rotina"
          title="Seus treinos"
          description="Monte os treinos do rodízio, escolha os exercícios e quantas séries fazer em cada um."
        />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href={HISTORY_URL} className={LINK_CLASS}>
            <CalendarIcon className="size-5" />
            Histórico
          </Link>
          <Link href={EXERCISES_URL} className={LINK_CLASS}>
            <TrendIcon className="size-5" />
            Evolução
          </Link>
        </div>
      </div>
      <RoutineEditor initial={routine} catalog={catalog} />
    </>
  );
}
