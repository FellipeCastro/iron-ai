"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Sparkline } from "@/components/charts/sparkline";
import type { ExerciseSummary } from "@/lib/data/types";
import { MUSCLE_LABEL, formatKg, formatSigned } from "@/lib/format";
import { exerciseUrl } from "@/lib/routes";
import type { MuscleGroup } from "@/db/schema";
import { SearchIcon } from "./icons";
import { Badge, inputBase } from "./ui";

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function ExerciseList({ exercises }: { exercises: ExerciseSummary[] }) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = normalize(query.trim());
    const map = new Map<MuscleGroup, ExerciseSummary[]>();
    for (const e of exercises) {
      if (q && !normalize(e.name).includes(q) && !normalize(MUSCLE_LABEL[e.muscleGroup]).includes(q)) continue;
      map.set(e.muscleGroup, [...(map.get(e.muscleGroup) ?? []), e]);
    }
    return [...map];
  }, [exercises, query]);

  if (exercises.length === 0) {
    return <p className="mt-10 text-[15px] text-[#5b5b66]">Os exercícios aparecem aqui depois do primeiro treino.</p>;
  }

  return (
    <>
      <label className="relative mt-8 block">
        <span className="sr-only">Pesquisar exercício</span>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-[#8a8a94]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar exercício (ex.: supino, remada, agachamento)"
          className={`${inputBase} w-full pl-11`}
        />
      </label>

      {groups.length === 0 && <p className="mt-10 text-[15px] text-[#5b5b66]">Nenhum exercício encontrado para “{query.trim()}”.</p>}

      {groups.map(([group, list]) => (
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
                  <Sparkline values={e.trend} values2={e.trendReps} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
