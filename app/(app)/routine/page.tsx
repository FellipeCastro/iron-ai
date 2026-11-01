import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { RoutineEditor } from "@/components/app/routine-editor";
import { CalendarIcon } from "@/components/app/icons";
import { PageHeader } from "@/components/app/ui";
import { getCatalog, getRoutine } from "@/lib/data";
import { HISTORY_URL } from "@/lib/routes";

export const metadata: Metadata = { title: "Rotina" };

export default async function RoutinePage() {
  await auth.protect();
  const [routine, catalog] = await Promise.all([getRoutine(), getCatalog()]);

  return (
    <>
      <div className="relative">
        <PageHeader
          eyebrow="Rotina"
          title="Seus treinos"
          description="Monte os treinos do rodízio, escolha os exercícios e quantas séries fazer em cada um."
        />
        <Link
          href={HISTORY_URL}
          className="absolute top-0 right-0 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[14px] font-medium shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#f3f4f6] sm:px-5 sm:py-2.5 sm:text-[15px]"
        >
          <CalendarIcon className="size-5" />
          Histórico
        </Link>
      </div>
      <RoutineEditor initial={routine} catalog={catalog} />
    </>
  );
}
