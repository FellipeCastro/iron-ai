"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ExerciseRef } from "@/lib/data/types";
import { MUSCLE_LABEL } from "@/lib/format";

/** Exercise name that wraps onto as many lines as it needs, so it is never cut off. */
export function NameField({
  value,
  onChange,
  suggestions,
  onPick,
}: {
  value: string;
  onChange: (name: string) => void;
  suggestions: ExerciseRef[];
  onPick: (ref: ExerciseRef) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [typing, setTyping] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  const open = typing && value.trim() !== "";
  return (
    <div
      className="relative"
      // Close only when focus leaves the whole field, so tabbing into a suggestion keeps the list open.
      onBlur={(ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setTyping(false);
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        maxLength={80}
        onChange={(ev) => {
          setTyping(true);
          onChange(ev.target.value.replace(/\s+/g, " "));
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") ev.preventDefault();
          if (ev.key === "Escape") setTyping(false);
        }}
        className="-mx-2 block w-[calc(100%+1rem)] resize-none overflow-hidden rounded-[10px] border border-transparent bg-transparent px-2 py-0.5 text-[16px] leading-[22px] font-semibold outline-none hover:border-[#e5e7eb] focus:border-[#111]"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-[16px] border border-[#ececec] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          {suggestions.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                // Keep focus in the textarea on mouse press; the pick itself happens on click.
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  setTyping(false);
                  onPick(r);
                  ref.current?.focus();
                }}
                className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left hover:bg-[#f9f9fb]"
              >
                <span className="text-[14px] font-medium">{r.name}</span>
                <span className="text-[12px] font-normal text-[#5b5b66]">{MUSCLE_LABEL[r.muscleGroup]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
