import type { MuscleGroup } from "@/db/schema";

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  peito: "Peito",
  costas: "Costas",
  ombros: "Ombros",
  biceps: "Bíceps",
  triceps: "Tríceps",
  antebraco: "Antebraço",
  trapezio: "Trapézio",
  quadriceps: "Quadríceps",
  posterior: "Posterior",
  gluteos: "Glúteos",
  adutores: "Adutores",
  abdutores: "Abdutores",
  panturrilha: "Panturrilha",
  abdomen: "Abdômen",
  lombar: "Lombar",
};

export const WEEKDAYS = [
  { iso: 1, short: "Seg", long: "Segunda" },
  { iso: 2, short: "Ter", long: "Terça" },
  { iso: 3, short: "Qua", long: "Quarta" },
  { iso: 4, short: "Qui", long: "Quinta" },
  { iso: 5, short: "Sex", long: "Sexta" },
  { iso: 6, short: "Sáb", long: "Sábado" },
  { iso: 7, short: "Dom", long: "Domingo" },
] as const;

export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export const formatNumber = (n: number) => num.format(n);
export const formatCompact = (n: number) => compact.format(n);
export const formatKg = (n: number) => `${num.format(n)} kg`;
export const formatSigned = (n: number, unit = "") => `${n > 0 ? "+" : n < 0 ? "−" : ""}${num.format(Math.abs(n))}${unit}`;

/** Epley estimate of the one-rep max. */
export const estimate1rm = (weight: number, reps: number) => Math.round(weight * (1 + reps / 30) * 10) / 10;

/** Calendar date (YYYY-MM-DD) of an instant in a timezone. */
export const dateKey = (date: Date, timeZone: string) => date.toLocaleDateString("en-CA", { timeZone });

export function formatDate(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone, ...options }).replace(/\./g, "").replace(/ de (?=[a-z]{3}\b)/g, " ");
}

export function formatTime(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" });
}

export function daysBetween(fromKey: string, toKey: string) {
  return Math.round((Date.parse(toKey) - Date.parse(fromKey)) / 86_400_000);
}

export function formatRelativeDay(iso: string, now: Date, timeZone: string) {
  const diff = daysBetween(dateKey(new Date(iso), timeZone), dateKey(now, timeZone));
  if (diff === 0) return "hoje";
  if (diff === 1) return "ontem";
  if (diff < 7) return `há ${diff} dias`;
  return formatDate(iso, timeZone);
}

export function formatDuration(startIso: string, endIso: string) {
  const min = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`;
}
