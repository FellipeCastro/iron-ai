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
