import type { InlineKeyboard } from "./client";

export const confirmKeyboard = (id: string, okLabel: string): InlineKeyboard => [
  [
    { text: `✅ ${okLabel}`, callback_data: `ok:${id}` },
    { text: "✖️ Cancelar", callback_data: `no:${id}` },
  ],
];

export const pickKeyboard = (id: string, candidates: { name: string }[]): InlineKeyboard => [
  ...candidates.map((c, i) => [{ text: c.name, callback_data: `p:${id}:${i}` }]),
  [{ text: "✖️ Cancelar", callback_data: `no:${id}` }],
];

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Weekday toggles (ISO numbers 1–7) in rows of four, plus the confirm button. */
export const daysKeyboard = (id: string, selected: number[]): InlineKeyboard => {
  const buttons = WEEKDAYS.map((label, i) => ({
    text: selected.includes(i + 1) ? `✅ ${label}` : label,
    callback_data: `d:${id}:${i + 1}`,
  }));
  return [buttons.slice(0, 4), buttons.slice(4), [{ text: "Confirmar dias", callback_data: `ok:${id}` }]];
};

export const skipKeyboard = (id: string, label: string): InlineKeyboard => [[{ text: label, callback_data: `sk:${id}` }]];

export const durationKeyboard = (id: string): InlineKeyboard => [
  [
    { text: "✅ Confirmar", callback_data: `ok:${id}` },
    { text: "✏️ Editar", callback_data: `ed:${id}` },
  ],
];
