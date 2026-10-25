"use client";

import { useMemo, useState, useTransition } from "react";
import { saveRoutineAction } from "@/app/(app)/actions";
import type { DayLetter, ExerciseRef, Routine, RoutineDay } from "@/lib/data/types";
import { MUSCLE_LABEL, formatKg } from "@/lib/format";
import { ChevronDownIcon } from "@/components/landing/icons";
import { ChevronUpIcon, MinusIcon, PlusIcon, SearchIcon, TrashIcon } from "./icons";
import { useToast } from "./toast";
import { Badge, Card, buttonPrimary, buttonSecondary, inputBase } from "./ui";

const LETTERS: DayLetter[] = ["A", "B", "C", "D", "E"];
const MAX_SETS = 6;

export function RoutineEditor({ initial, catalog }: { initial: Routine; catalog: ExerciseRef[] }) {
  // A new user starts with an empty "A" to fill in.
  const [days, setDays] = useState<RoutineDay[]>(initial.days.length ? initial.days : [{ letter: "A", title: "Treino A", exercises: [] }]);
  const [saved, setSaved] = useState<RoutineDay[]>(initial.days);
  const [selected, setSelected] = useState<DayLetter>(initial.nextLetter);
  const [query, setQuery] = useState("");
  const [toast, showToast] = useToast();
  const [saving, startTransition] = useTransition();

  const day = days.find((d) => d.letter === selected) ?? days[0];
  const dirty = JSON.stringify(days) !== JSON.stringify(saved);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const inDay = new Set(day.exercises.map((e) => e.id));
    return catalog.filter((e) => !inDay.has(e.id) && e.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, catalog, day]);

  function updateDay(fn: (d: RoutineDay) => RoutineDay) {
    setDays((all) => all.map((d) => (d.letter === day.letter ? fn(d) : d)));
  }

  function move(index: number, delta: number) {
    updateDay((d) => {
      const list = [...d.exercises];
      const [item] = list.splice(index, 1);
      list.splice(index + delta, 0, item);
      return { ...d, exercises: list };
    });
  }

  function setSets(index: number, sets: number) {
    updateDay((d) => ({
      ...d,
      exercises: d.exercises.map((e, i) => (i === index ? { ...e, plannedSets: Math.min(MAX_SETS, Math.max(1, sets)) } : e)),
    }));
  }

  function addExercise(ref: ExerciseRef) {
    updateDay((d) => ({ ...d, exercises: [...d.exercises, { ...ref, plannedSets: 3, targets: [] }] }));
    setQuery("");
  }

  function addDay() {
    const letter = LETTERS.find((l) => !days.some((d) => d.letter === l));
    if (!letter) return;
    setDays([...days, { letter, title: "Novo treino", exercises: [] }]);
    setSelected(letter);
  }

  function removeDay() {
    // Letters stay sequential (A, B, C…) so the rotation order is always obvious.
    const rest = days.filter((d) => d.letter !== day.letter).map((d, i) => ({ ...d, letter: LETTERS[i] }));
    setDays(rest);
    setSelected(rest[0].letter);
  }

  function save() {
    startTransition(async () => {
      const result = await saveRoutineAction(
        days.map((d) => ({ title: d.title, exercises: d.exercises.map((e) => ({ id: e.id, plannedSets: e.plannedSets })) })),
      );
      if (!result.ok) return showToast(result.error);
      setSaved(days);
      showToast("Rotina salva");
    });
  }

  return (
    <>
      {/* Rotation */}
      <Card className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-bold">Rodízio</h2>
            <p className="mt-1 text-[14px] text-[#5b5b66]">Os treinos seguem esta ordem, independente do dia da semana.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Treinos da rotina">
            {days.map((d, i) => (
              <div key={d.letter} className="flex items-center gap-2">
                {i > 0 && <span className="text-[#c4c4cc]">→</span>}
                <button
                  type="button"
                  role="tab"
                  aria-selected={d.letter === day.letter}
                  onClick={() => setSelected(d.letter)}
                  className={`relative flex size-12 items-center justify-center rounded-2xl text-[20px] font-bold transition-colors ${
                    d.letter === day.letter ? "bg-[#1e1a24] text-white" : "bg-[#f5f5f8] text-[#111] hover:bg-[#ececf1]"
                  }`}
                >
                  {d.letter}
                  {d.letter === initial.nextLetter && (
                    <span className="absolute -top-2 -right-2 rounded-full bg-[#2AABEE] px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white">
                      próximo
                    </span>
                  )}
                </button>
              </div>
            ))}
            {days.length < LETTERS.length && (
              <button
                type="button"
                onClick={addDay}
                aria-label="Adicionar treino"
                className="ml-2 flex size-12 items-center justify-center rounded-2xl border border-dashed border-[#d4d4d8] text-[#5b5b66] hover:bg-[#f5f5f8]"
              >
                <PlusIcon className="size-5" />
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Selected day */}
      <Card className="mt-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#1e1a24] text-[24px] font-bold text-white">
            {day.letter}
          </span>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Nome do treino</span>
            <input
              value={day.title}
              onChange={(e) => updateDay((d) => ({ ...d, title: e.target.value }))}
              className="w-full rounded-[12px] border border-transparent bg-transparent px-2 py-1 text-[24px] font-semibold outline-none hover:border-[#e5e7eb] focus:border-[#111]"
            />
          </label>
          {days.length > 1 && (
            <button type="button" onClick={removeDay} className={`${buttonSecondary} h-10! px-4! text-[#be123c]`}>
              <TrashIcon className="size-4" /> Remover treino
            </button>
          )}
        </div>

        {day.exercises.length === 0 ? (
          <p className="mt-6 rounded-[20px] border border-dashed border-[#e5e7eb] px-6 py-10 text-center text-[15px] text-[#5b5b66]">
            Nenhum exercício ainda. Busque abaixo para adicionar.
          </p>
        ) : (
          <ol className="mt-6 grid gap-3">
            {day.exercises.map((e, i) => (
              <li key={e.id} className="rounded-[20px] border border-[#ececec] p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="w-5 text-center text-[15px] font-semibold text-[#8a8a94]">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold">{e.name}</p>
                    <p className="text-[13px] text-[#5b5b66]">{MUSCLE_LABEL[e.muscleGroup]}</p>
                  </div>

                  <div className="flex items-center gap-1 rounded-full bg-[#f5f5f8] p-1" aria-label={`Séries de ${e.name}`}>
                    <button
                      type="button"
                      onClick={() => setSets(i, e.plannedSets - 1)}
                      disabled={e.plannedSets <= 1}
                      aria-label="Menos uma série"
                      className="flex size-8 items-center justify-center rounded-full hover:bg-white disabled:opacity-30"
                    >
                      <MinusIcon className="size-4" />
                    </button>
                    <span className="w-16 text-center text-[14px] font-semibold">
                      {e.plannedSets} {e.plannedSets === 1 ? "série" : "séries"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSets(i, e.plannedSets + 1)}
                      disabled={e.plannedSets >= MAX_SETS}
                      aria-label="Mais uma série"
                      className="flex size-8 items-center justify-center rounded-full hover:bg-white disabled:opacity-30"
                    >
                      <PlusIcon className="size-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <IconButton label="Mover para cima" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ChevronUpIcon className="size-4" />
                    </IconButton>
                    <IconButton label="Mover para baixo" disabled={i === day.exercises.length - 1} onClick={() => move(i, 1)}>
                      <ChevronDownIcon className="size-4" />
                    </IconButton>
                    <IconButton
                      label={`Remover ${e.name}`}
                      onClick={() => updateDay((d) => ({ ...d, exercises: d.exercises.filter((x) => x.id !== e.id) }))}
                    >
                      <TrashIcon className="size-4 text-[#be123c]" />
                    </IconButton>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 pl-9">
                  {Array.from({ length: e.plannedSets }, (_, s) => {
                    const t = e.targets[s];
                    return (
                      <Badge key={s} tone={t ? "neutral" : "blue"}>
                        S{s + 1} · {t ? `${formatKg(t.weight)} × ${t.reps}` : "meta na 1ª vez"}
                      </Badge>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
        )}

        {/* Add exercise */}
        <div className="relative mt-6">
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
            <ul className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-[20px] border border-[#ececec] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => addExercise(r)}
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

        <p className="mt-6 text-[13px] text-[#8a8a94]">
          As metas de cada série são atualizadas automaticamente: bateu a meta, +1 rep; chegou a 12, a carga sobe e as reps voltam para 8.
        </p>
      </Card>

      {/* Save bar */}
      {dirty && (
        <div className="sticky bottom-6 z-20 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-full bg-[#1e1a24] py-3 pr-3 pl-6 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
          <span className="text-[15px] font-medium">Você tem alterações não salvas</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDays(saved)} className="h-10 rounded-full px-5 text-[15px] font-medium hover:bg-white/10">
              Descartar
            </button>
            <button type="button" onClick={save} disabled={saving} className={`${buttonPrimary} h-10! bg-white text-[#111]!`}>
              Salvar rotina
            </button>
          </div>
        </div>
      )}
      {toast}
    </>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-full hover:bg-[#f3f4f6] disabled:opacity-30"
    >
      {children}
    </button>
  );
}
