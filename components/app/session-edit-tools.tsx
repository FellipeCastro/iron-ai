"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addSetAction, deleteExerciseFromSessionAction, deleteSessionAction } from "@/app/(app)/actions";
import type { ExerciseRef } from "@/lib/data/types";
import { MUSCLE_LABEL } from "@/lib/format";
import { HISTORY_URL } from "@/lib/routes";
import { searchByName } from "@/lib/search";
import { PlusIcon, SearchIcon, TrashIcon } from "./icons";
import { useToast } from "./toast";
import { inputBase } from "./ui";

const ghostButton = "inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e5e7eb] px-4 text-[13px] font-medium transition-colors hover:bg-[#f3f4f6]";

/** Reps and weight form that appends a set of `exercise` to the session. */
function SetForm({
  sessionId,
  exercise,
  initial,
  submitLabel,
  onDone,
  onCancel,
}: {
  sessionId: string;
  exercise: ExerciseRef;
  initial?: { weight: number; reps: number };
  submitLabel: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [r, setR] = useState(String(initial?.reps ?? ""));
  const [w, setW] = useState(String(initial?.weight ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await addSetAction({ sessionId, exerciseId: exercise.id, weight: Number(w.replace(",", ".") || 0), reps: Number(r) });
      if (!result.ok) return setError(result.error);
      setError(null);
      showToast("Série adicionada");
      onDone();
    });
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="flex items-center gap-1.5 text-[13px] text-[#5b5b66]">
        <input
          type="text"
          inputMode="numeric"
          aria-label="Repetições"
          value={r}
          onChange={(e) => setR(e.target.value)}
          autoFocus
          className={`${inputBase} h-9 w-16 px-3 text-[14px]`}
        />
        reps
      </label>
      <span className="text-[13px] text-[#5b5b66]">×</span>
      <label className="flex items-center gap-1.5 text-[13px] text-[#5b5b66]">
        <input
          type="text"
          inputMode="decimal"
          aria-label="Carga em kg"
          value={w}
          onChange={(e) => setW(e.target.value)}
          className={`${inputBase} h-9 w-20 px-3 text-[14px]`}
        />
        kg
      </label>
      <button type="submit" disabled={pending} className="h-9 rounded-full bg-black px-4 text-[13px] font-semibold text-white disabled:opacity-40">
        {submitLabel}
      </button>
      <button type="button" onClick={onCancel} disabled={pending} className="h-9 rounded-full px-3 text-[13px] font-medium text-[#5b5b66] hover:bg-[#f3f4f6]">
        Cancelar
      </button>
      {error && <span className="w-full text-[13px] text-[#be123c]">{error}</span>}
      {toast}
    </form>
  );
}

/** "Adicionar série" under an exercise, prefilled with its last set. */
export function AddSet({ sessionId, exercise, last }: { sessionId: string; exercise: ExerciseRef; last: { weight: number; reps: number } }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={ghostButton}>
        <PlusIcon className="size-3.5" /> Adicionar série
      </button>
    );
  }
  return <SetForm sessionId={sessionId} exercise={exercise} initial={last} submitLabel="Adicionar" onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />;
}

/** Search box that picks an exercise from the catalog and logs its first set in this session. */
export function AddExercise({ sessionId, catalog }: { sessionId: string; catalog: ExerciseRef[] }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ExerciseRef | null>(null);
  const results = useMemo(() => searchByName(catalog, query), [catalog, query]);

  if (picked) {
    return (
      <div className="rounded-[20px] border border-[#ececec] bg-white p-4">
        <p className="mb-3 text-[15px] font-semibold">{picked.name}</p>
        <SetForm
          sessionId={sessionId}
          exercise={picked}
          submitLabel="Adicionar exercício"
          onDone={() => {
            setPicked(null);
            setQuery("");
          }}
          onCancel={() => setPicked(null)}
        />
      </div>
    );
  }

  return (
    <div className="relative z-30">
      <label className="relative block">
        <span className="sr-only">Adicionar exercício</span>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-[#8a8a94]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
                onClick={() => setPicked(r)}
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

/** Trash button that removes an exercise, with all its sets, from the session (asks first). */
export function DeleteExercise({ sessionId, exercise }: { sessionId: string; exercise: ExerciseRef }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteExerciseFromSessionAction({ sessionId, exerciseId: exercise.id });
      if (!result.ok) return setError(result.error);
      if (result.data.sessionEmpty) router.push(HISTORY_URL);
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Excluir ${exercise.name}`}
        title="Excluir exercício"
        className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-[#fff1f3]"
      >
        <TrashIcon className="size-4 text-[#be123c]" />
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-[13px] text-[#5b5b66]">Excluir exercício e suas séries?</span>
      <button type="button" onClick={remove} disabled={pending} className="h-8 rounded-full bg-[#be123c] px-3 text-[13px] font-semibold text-white disabled:opacity-40">
        Excluir
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="h-8 rounded-full px-3 text-[13px] font-medium text-[#5b5b66] hover:bg-[#f3f4f6]">
        Cancelar
      </button>
      {error && <span className="w-full text-right text-[13px] text-[#be123c]">{error}</span>}
    </div>
  );
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
