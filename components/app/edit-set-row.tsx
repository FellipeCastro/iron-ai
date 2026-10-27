"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSetAction, updateSetAction } from "@/app/(app)/actions";
import { HISTORY_URL } from "@/lib/routes";
import { useToast } from "./toast";
import { inputBase } from "./ui";

/** One logged set, editable in place: load, reps, and removal. */
export function EditSetRow({ setId, position, weight, reps }: { setId: string; position: number; weight: number; reps: number }) {
  const router = useRouter();
  const [w, setW] = useState(String(weight));
  const [r, setR] = useState(String(reps));
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const [pending, startTransition] = useTransition();

  const dirty = Number(w.replace(",", ".")) !== weight || Number(r) !== reps;

  function save() {
    const nextWeight = Number(w.replace(",", "."));
    const nextReps = Number(r);
    startTransition(async () => {
      const result = await updateSetAction({ setId, weight: nextWeight, reps: nextReps });
      if (!result.ok) return setError(result.error);
      setError(null);
      showToast("Série atualizada");
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteSetAction({ setId });
      if (!result.ok) return setError(result.error);
      if (result.data.sessionEmpty) router.push(HISTORY_URL);
      else showToast("Série removida");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[72px] text-[13px] text-[#5b5b66]">{position}ª série</span>
      <label className="flex items-center gap-1.5 text-[13px] text-[#5b5b66]">
        <input
          type="text"
          inputMode="decimal"
          aria-label={`Carga da ${position}ª série em kg`}
          value={w}
          onChange={(e) => setW(e.target.value)}
          className={`${inputBase} h-9 w-20 px-3 text-[14px]`}
        />
        kg
      </label>
      <label className="flex items-center gap-1.5 text-[13px] text-[#5b5b66]">
        <input
          type="text"
          inputMode="numeric"
          aria-label={`Repetições da ${position}ª série`}
          value={r}
          onChange={(e) => setR(e.target.value)}
          className={`${inputBase} h-9 w-16 px-3 text-[14px]`}
        />
        reps
      </label>
      {dirty && (
        <button type="button" onClick={save} disabled={pending} className="h-9 rounded-full bg-black px-4 text-[13px] font-semibold text-white disabled:opacity-40">
          Salvar
        </button>
      )}
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="h-9 rounded-full px-3 text-[13px] font-medium text-[#be123c] hover:bg-[#fff1f3] disabled:opacity-40"
      >
        Remover
      </button>
      {error && <span className="w-full text-[13px] text-[#be123c]">{error}</span>}
      {toast}
    </div>
  );
}
