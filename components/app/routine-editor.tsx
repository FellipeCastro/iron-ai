"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveRoutineAction } from "@/app/(app)/actions";
import type { DayLetter, ExerciseRef, Routine, RoutineDay } from "@/lib/data/types";
import { MUSCLE_LABEL, formatKg } from "@/lib/format";
import { GripIcon, MinusIcon, PlusIcon, SearchIcon, TrashIcon } from "./icons";
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

  // A small distance threshold keeps clicks on the name input and the +/- buttons from starting a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    updateDay((d) => {
      const from = d.exercises.findIndex((e) => e.id === active.id);
      const to = d.exercises.findIndex((e) => e.id === over.id);
      return from < 0 || to < 0 ? d : { ...d, exercises: arrayMove(d.exercises, from, to) };
    });
  }

  function renameExercise(index: number, name: string) {
    updateDay((d) => ({
      ...d,
      exercises: d.exercises.map((e, i) => (i === index ? { ...e, name } : e)),
    }));
  }

  function setSets(index: number, sets: number) {
    updateDay((d) => ({
      ...d,
      exercises: d.exercises.map((e, i) => (i === index ? { ...e, plannedSets: Math.min(MAX_SETS, Math.max(1, sets)) } : e)),
    }));
  }

  function addExercise(ref: ExerciseRef) {
    updateDay((d) => ({
      ...d,
      exercises: [...d.exercises, { ...ref, plannedSets: 3, targets: [] }],
    }));
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
      const savedNames = new Map(saved.flatMap((d) => d.exercises.map((e) => [e.id, e.name] as const)));
      const result = await saveRoutineAction(
        days.map((d) => ({
          title: d.title,
          exercises: d.exercises.map((e) => ({
            id: e.id,
            plannedSets: e.plannedSets,
            ...(e.name.trim() && e.name.trim() !== savedNames.get(e.id) ? { name: e.name } : {}),
          })),
        })),
      );
      if (!result.ok) return showToast(result.error);
      // Renamed exercises may now be a different record (a personal copy of a catalog one).
      const renamed = result.data;
      const next = days.map((d) => ({
        ...d,
        exercises: d.exercises.map((e) => (renamed[e.id] ? { ...e, ...renamed[e.id], targets: [] } : e)),
      }));
      setDays(next);
      setSaved(next);
      showToast("Rotina salva");
    });
  }

  return (
    <>
      {/* Rotation */}
      <Card className="mt-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h2 className="text-[20px] font-bold">Rodízio</h2>
            <p className="mt-1 text-[14px] text-[#5b5b66]">Os treinos seguem esta ordem, independente do dia da semana.</p>
          </div>
          <div className="flex items-center gap-1.5 pt-2 sm:gap-2" role="tablist" aria-label="Treinos da rotina">
            {days.map((d, i) => (
              <div key={d.letter} className="flex items-center gap-1.5 sm:gap-2">
                {i > 0 && <span className="text-[13px] text-[#c4c4cc] sm:text-[16px]">→</span>}
                <button
                  type="button"
                  role="tab"
                  aria-selected={d.letter === day.letter}
                  onClick={() => setSelected(d.letter)}
                  className={`relative flex size-11 shrink-0 items-center justify-center rounded-2xl text-[18px] font-bold transition-colors sm:size-12 sm:text-[20px] ${
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
                className="ml-1 flex size-11 shrink-0 items-center justify-center rounded-2xl border border-dashed sm:ml-2 sm:size-12 border-[#d4d4d8] text-[#5b5b66] hover:bg-[#f5f5f8]"
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
              <TrashIcon className="size-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Remover treino</span>
            </button>
          )}
        </div>

        {day.exercises.length === 0 ? (
          <p className="mt-6 rounded-[20px] border border-dashed border-[#e5e7eb] px-6 py-10 text-center text-[15px] text-[#5b5b66]">
            Nenhum exercício ainda. Busque abaixo para adicionar.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={day.exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              <ol className="mt-6 grid gap-3">
                {day.exercises.map((e, i) => (
                  <SortableRow key={e.id} id={e.id}>
                    {(handle) => (
                      <>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                          <div className="flex min-w-0 basis-full items-start gap-2 sm:basis-0 sm:flex-1 sm:items-center sm:gap-4">
                            <button
                              type="button"
                              aria-label={`Arrastar ${e.name} para reordenar`}
                              title="Arraste para reordenar"
                              className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-[#8a8a94] hover:bg-[#f3f4f6] active:cursor-grabbing"
                              {...handle}
                            >
                              <GripIcon className="size-5" />
                            </button>
                            <span className="w-4 shrink-0 pt-1.5 text-center text-[15px] font-semibold text-[#8a8a94] sm:pt-0">{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <label>
                                <span className="sr-only">Nome do exercício</span>
                                <NameField value={e.name} onChange={(name) => renameExercise(i, name)} />
                              </label>
                              <p className="text-[13px] text-[#5b5b66]">{MUSCLE_LABEL[e.muscleGroup]}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 rounded-full bg-[#f5f5f8] p-1 max-sm:ml-11" aria-label={`Séries de ${e.name}`}>
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

                          <div className="flex items-center gap-1 max-sm:ml-auto">
                            <IconButton
                              label={`Remover ${e.name}`}
                              onClick={() =>
                                updateDay((d) => ({
                                  ...d,
                                  exercises: d.exercises.filter((x) => x.id !== e.id),
                                }))
                              }
                            >
                              <TrashIcon className="size-4 text-[#be123c]" />
                            </IconButton>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-9">
                          {Array.from({ length: e.plannedSets }, (_, s) => {
                            const t = e.targets[s];
                            return (
                              <Badge key={s} tone={t ? "neutral" : "blue"}>
                                S{s + 1} · {t ? `${formatKg(t.weight)} × ${t.reps}` : "meta na 1ª vez"}
                              </Badge>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </SortableRow>
                ))}
              </ol>
            </SortableContext>
          </DndContext>
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
        <div className="sticky bottom-24 z-20 lg:bottom-6 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-full bg-[#1e1a24] py-3 pr-3 pl-6 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
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

/** Exercise name that wraps onto as many lines as it needs, so it is never cut off. */
function NameField({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={80}
      onChange={(ev) => onChange(ev.target.value.replace(/\s+/g, " "))}
      onKeyDown={(ev) => ev.key === "Enter" && ev.preventDefault()}
      className="-mx-2 block w-[calc(100%+1rem)] resize-none overflow-hidden rounded-[10px] border border-transparent bg-transparent px-2 py-0.5 text-[16px] leading-[22px] font-semibold outline-none hover:border-[#e5e7eb] focus:border-[#111]"
    />
  );
}

function SortableRow({ id, children }: { id: string; children: (handle: Record<string, unknown>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-[20px] border border-[#ececec] bg-white p-4 sm:p-5 ${isDragging ? "relative z-10 shadow-[0_10px_30px_rgba(0,0,0,0.15)]" : ""}`}
    >
      {children({ ...attributes, ...listeners })}
    </li>
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
