"use client";

import { useState, useTransition } from "react";
import { updateSessionDurationAction } from "@/app/(app)/actions";
import { MAX_DURATION_MIN } from "@/lib/engine/duration";
import { useToast } from "./toast";
import { inputBase } from "./ui";

/** Inline editor for the duration of a finished workout, in minutes. */
export function EditDuration({ sessionId, minutes }: { sessionId: string; minutes: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(minutes));
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const [pending, startTransition] = useTransition();

  function save() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_DURATION_MIN) return setError(`Use entre 1 e ${MAX_DURATION_MIN} minutos.`);
    startTransition(async () => {
      const result = await updateSessionDurationAction({ sessionId, minutes: parsed });
      if (!result.ok) return setError(result.error);
      setEditing(false);
      setError(null);
      showToast("Duração atualizada");
    });
  }

  function open() {
    setValue(String(minutes));
    setError(null);
    setEditing(true);
  }

  return (
    <>
      {editing ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="flex items-center gap-2 text-[13px] text-[#5b5b66]">
            Duração
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_DURATION_MIN}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              className={`${inputBase} h-9 w-20 px-3 text-[14px]`}
            />
            min
          </label>
          <button type="submit" disabled={pending} className="h-9 rounded-full bg-black px-4 text-[13px] font-semibold text-white disabled:opacity-40">
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={pending}
            className="h-9 rounded-full px-3 text-[13px] font-medium text-[#5b5b66] hover:bg-[#f3f4f6]"
          >
            Cancelar
          </button>
          {error && <span className="w-full text-[13px] text-[#be123c]">{error}</span>}
        </form>
      ) : (
        <button
          type="button"
          onClick={open}
          className="h-10 rounded-full bg-black px-5 text-[14px] font-semibold text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] transition-colors hover:bg-[#2b2b33]"
        >
          Editar duração
        </button>
      )}
      {toast}
    </>
  );
}
