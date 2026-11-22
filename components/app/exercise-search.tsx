"use client";

import type { ExerciseRef } from "@/lib/data/types";
import { MUSCLE_LABEL } from "@/lib/format";
import { SearchIcon } from "./icons";
import { inputBase } from "./ui";

/**
 * Catalog search box with its results dropdown (shown while something is typed). Controlled: the parent keeps the
 * query and computes `results`, so each screen decides what to leave out of the catalog.
 */
export function ExerciseSearch({
  query,
  onQueryChange,
  results,
  onPick,
  className,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  results: ExerciseRef[];
  onPick: (ref: ExerciseRef) => void;
  className?: string;
}) {
  return (
    <div className={className ? `relative z-30 ${className}` : "relative z-30"}>
      <label className="relative block">
        <span className="sr-only">Adicionar exercício</span>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-[#8a8a94]" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Adicionar exercício (ex.: supino, remada, agachamento)"
          className={`${inputBase} w-full pl-11`}
        />
      </label>
      {query.trim() && (
        <ul className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-[20px] border border-[#ececec] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left hover:bg-[#f9f9fb]"
              >
                <span className="text-[15px] font-medium">{r.name}</span>
                <span className="text-[13px] text-[#5b5b66]">{MUSCLE_LABEL[r.muscleGroup]}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-5 py-4 text-[14px] text-[#5b5b66]">Nenhum exercício encontrado.</li>}
        </ul>
      )}
    </div>
  );
}
