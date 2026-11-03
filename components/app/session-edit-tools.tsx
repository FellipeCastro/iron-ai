"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addSetAction, deleteSessionAction } from "@/app/(app)/actions";
import type { ExerciseRef } from "@/lib/data/types";
import { HISTORY_URL } from "@/lib/routes";
import { PlusIcon, TrashIcon } from "./icons";
import { useToast } from "./toast";
import { inputBase } from "./ui";

const ghostButton = "inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e5e7eb] px-4 text-[13px] font-medium transition-colors hover:bg-[#f3f4f6]";

/** Weight and reps form that appends a set to the session; with several `exercises` the user picks which one. */
function AddSetForm({
  sessionId,
  exercises,
  initial,
  label,
}: {
  sessionId: string;
  exercises: ExerciseRef[];
  initial?: { weight: number; reps: number };
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [exerciseId, setExerciseId] = useState(exercises.length === 1 ? exercises[0].id : "");
  const [w, setW] = useState(String(initial?.weight ?? ""));
  const [r, setR] = useState(String(initial?.reps ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const [pending, startTransition] = useTransition();

  function save() {
    if (!exerciseId) return setError("Escolha o exercício.");
    startTransition(async () => {
      const result = await addSetAction({ sessionId, exerciseId, weight: Number(w.replace(",", ".") || 0), reps: Number(r) });
      if (!result.ok) return setError(result.error);
      setError(null);
      setOpen(false);
      showToast("Série adicionada");
    });
  }

  if (!open) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={ghostButton}>
          <PlusIcon className="size-3.5" /> {label}
        </button>
        {toast}
      </>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {exercises.length > 1 && (
        <select
          aria-label="Exercício"
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          className={`${inputBase} h-9 max-w-[220px] px-3 text-[14px]`}
        >
          <option value="">Exercício…</option>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-1.5 text-[13px] text-[#5b5b66]">
        <input
          type="text"
          inputMode="decimal"
          aria-label="Carga em kg"
          value={w}
          onChange={(e) => setW(e.target.value)}
          autoFocus
          className={`${inputBase} h-9 w-20 px-3 text-[14px]`}
        />
        kg
      </label>
      <label className="flex items-center gap-1.5 text-[13px] text-[#5b5b66]">
        <input
          type="text"
          inputMode="numeric"
          aria-label="Repetições"
          value={r}
          onChange={(e) => setR(e.target.value)}
          className={`${inputBase} h-9 w-16 px-3 text-[14px]`}
        />
        reps
      </label>
      <button type="submit" disabled={pending} className="h-9 rounded-full bg-black px-4 text-[13px] font-semibold text-white disabled:opacity-40">
        Adicionar
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={pending}
        className="h-9 rounded-full px-3 text-[13px] font-medium text-[#5b5b66] hover:bg-[#f3f4f6]"
      >
        Cancelar
      </button>
      {error && <span className="w-full text-[13px] text-[#be123c]">{error}</span>}
    </form>
  );
}

/** "Adicionar série" under an exercise, prefilled with its last set. */
export function AddSet({ sessionId, exercise, last }: { sessionId: string; exercise: ExerciseRef; last: { weight: number; reps: number } }) {
  return <AddSetForm sessionId={sessionId} exercises={[exercise]} initial={last} label="Adicionar série" />;
}

/** "Adicionar exercício": picks one from the catalog and logs its first set in this session. */
export function AddExercise({ sessionId, catalog }: { sessionId: string; catalog: ExerciseRef[] }) {
  return <AddSetForm sessionId={sessionId} exercises={catalog} label="Adicionar exercício" />;
}

/** Two-step delete of the whole workout. */
export function DeleteSession({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteSessionAction({ sessionId });
      if (!result.ok) return setError(result.error);
      router.push(HISTORY_URL);
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium text-[#be123c] hover:bg-[#fff1f3]"
      >
        <TrashIcon className="size-3.5" /> Excluir treino
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-[#5b5b66]">Excluir este treino e todas as séries?</span>
      <button type="button" onClick={remove} disabled={pending} className="h-9 rounded-full bg-[#be123c] px-4 text-[13px] font-semibold text-white disabled:opacity-40">
        Excluir
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="h-9 rounded-full px-3 text-[13px] font-medium text-[#5b5b66] hover:bg-[#f3f4f6]"
      >
        Cancelar
      </button>
      {error && <span className="w-full text-[13px] text-[#be123c]">{error}</span>}
    </div>
  );
}
