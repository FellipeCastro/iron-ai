import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Badge, PageHeader } from "@/components/app/ui";
import { Sparkline } from "@/components/charts/sparkline";
import { getExerciseSummaries, type ExerciseSummary } from "@/lib/data";
import { MUSCLE_LABEL, formatKg, formatSigned } from "@/lib/format";
import { exerciseUrl } from "@/lib/routes";
import type { MuscleGroup } from "@/db/schema";

export const metadata: Metadata = { title: "Evolução — Iron AI" };

export default async function ExercisesPage() {
  await auth.protect();
  const { exercises } = await getExerciseSummaries();

  const groups = new Map<MuscleGroup, ExerciseSummary[]>();
  for (const e of exercises) groups.set(e.muscleGroup, [...(groups.get(e.muscleGroup) ?? []), e]);

  return (
    <>
      <PageHeader
        eyebrow="Evolução"
        title="Seus exercícios"
        description="Carga atual e quanto ela mudou nos últimos 30 dias. Toque em um exercício para ver o gráfico completo."
      />

      {exercises.length === 0 && <p className="mt-10 text-[15px] text-[#5b5b66]">Os exercícios aparecem aqui depois do primeiro treino.</p>}

      {[...groups].map(([group, list]) => (
        <section key={group} className="mt-10">
          <h2 className="mb-4 text-[18px] font-semibold">{MUSCLE_LABEL[group]}</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {list.map((e) => (
              <Link
                key={e.id}
                href={exerciseUrl(e.id)}
                className="group flex flex-col rounded-[24px] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.09)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[16px] font-semibold group-hover:underline">{e.name}</h3>
                  {e.stagnant && <Badge tone="warn">Estagnado</Badge>}
                </div>
                <div className="mt-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[13px] text-[#5b5b66]">Carga atual</p>
                    <p className="text-[28px] leading-9 font-semibold">{formatKg(e.currentWeight)}</p>
                    <p className="mt-1 text-[13px]">
                      {e.weightChange30d > 0 ? (
                        <span className="font-semibold text-[#15803d]">{formatSigned(e.weightChange30d, " kg")}</span>
                      ) : (
                        <span className="text-[#8a8a94]">Sem mudança de carga</span>
                      )}
                      {e.weightChange30d > 0 && <span className="text-[#8a8a94]"> em 30 dias</span>}
                    </p>
                  </div>
                  <Sparkline values={e.trend} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
