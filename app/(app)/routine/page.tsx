import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { RoutineEditor } from "@/components/app/routine-editor";
import { PageHeader } from "@/components/app/ui";
import { getCatalog, getRoutine } from "@/lib/data";

export const metadata: Metadata = { title: "Rotina" };

export default async function RoutinePage() {
  await auth.protect();
  const [routine, catalog] = await Promise.all([getRoutine(), getCatalog()]);

  return (
    <>
      <PageHeader
        eyebrow="Rotina"
        title="Seus treinos"
        description="Monte os treinos do rodízio, escolha os exercícios e quantas séries fazer em cada um."
      />
      <RoutineEditor initial={routine} catalog={catalog} />
    </>
  );
}
