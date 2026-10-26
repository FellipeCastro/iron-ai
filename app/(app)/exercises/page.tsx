import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { ExerciseList } from "@/components/app/exercise-list";
import { PageHeader } from "@/components/app/ui";
import { getExerciseSummaries } from "@/lib/data";

export const metadata: Metadata = { title: "Evolução" };

export default async function ExercisesPage() {
  await auth.protect();
  const { exercises } = await getExerciseSummaries();

  return (
    <>
      <PageHeader
        eyebrow="Evolução"
        title="Seus exercícios"
        description="Carga atual e quanto ela mudou nos últimos 30 dias. Toque em um exercício para ver o gráfico completo."
      />

      <ExerciseList exercises={exercises} />
    </>
  );
}
