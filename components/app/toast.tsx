"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "./icons";

/** Minimal confirmation toast: `const [toast, show] = useToast()` and render `{toast}`. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function show(text: string) {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3000);
  }

  const node = (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      {message && (
        <div className="flex items-center gap-2 rounded-full bg-[#1e1a24] px-5 py-3 text-[15px] font-medium text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
          <CheckIcon className="size-4 text-[#4ade80]" /> {message}
        </div>
      )}
    </div>
  );

  return [node, show] as const;
}
