"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function SortableRow({ id, children }: { id: string; children: (handle: Record<string, unknown>) => React.ReactNode }) {
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
