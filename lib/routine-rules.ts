// Routine limits shared by the server (lib/services/routine.ts, the save action) and the editor in the browser.
// No database import here, so client components can use it.

export const DAY_LETTERS = ["A", "B", "C", "D", "E"] as const;
export const MAX_PLANNED_SETS = 6;
