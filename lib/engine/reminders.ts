// Reminder timing, evaluated by the 15-minute cron in each user's timezone.

/** Late ticks (deploys, outages) still send within this window; after it the day's reminder is skipped. */
export const REMINDER_WINDOW_MIN = 120;

export type LocalTime = { date: string; minutes: number; isoWeekday: number };

/** Calendar date, minutes since midnight and ISO weekday (1 = Monday) of an instant in a timezone. */
export function localTime(now: Date, timeZone: string): LocalTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    isoWeekday: weekdays.indexOf(parts.weekday) + 1,
  };
}

/** "HH:MM" or "HH:MM:SS" → minutes since midnight. */
export const parseClock = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/** Free-text time ("18:30", "18h", "18h30", "às 7") → "HH:MM", or null when it is not a time of day. */
export function parseTimeInput(text: string) {
  const m = text
    .trim()
    .toLowerCase()
    .replace(/^(às|as)\s+/, "")
    .match(/^(\d{1,2})(?:\s*[:h]\s*([0-5]\d)?)?$/);
  if (!m) return null;
  const hours = Number(m[1]);
  if (hours > 23) return null;
  return `${String(hours).padStart(2, "0")}:${m[2] ?? "00"}`;
}

const WEEKDAY_WORDS: Record<string, number> = {
  seg: 1, segunda: 1, ter: 2, terca: 2, qua: 3, quarta: 3, qui: 4, quinta: 4, sex: 5, sexta: 5, sab: 6, sabado: 6, dom: 7, domingo: 7,
};

/** Free-text weekdays ("seg, qua e sex", "segunda a sexta", "todos os dias") → sorted ISO numbers (1 = Monday), or null. */
export function parseWeekdaysInput(text: string) {
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/-?feiras?\b/g, "");
  if (/\b(todos? os dias|todo dia|diariamente)\b/.test(t)) return [1, 2, 3, 4, 5, 6, 7];
  if (/\bdias uteis\b/.test(t)) return [1, 2, 3, 4, 5];
  if (/\bfins? de semana\b/.test(t)) return [6, 7];

  const found = [...t.matchAll(/\b(segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab|domingo|dom)\b/g)];
  if (!found.length) return null;
  const days = new Set<number>();
  for (let i = 0; i < found.length; i++) {
    const day = WEEKDAY_WORDS[found[i][1]];
    days.add(day);
    const next = found[i + 1];
    // "segunda a sexta": fill the days in between (wrapping past Sunday, e.g. "sex a seg").
    if (next && /^\s*(a|ate|ao|-)\s*$/.test(t.slice(found[i].index + found[i][0].length, next.index))) {
      const end = WEEKDAY_WORDS[next[1]];
      for (let d = day; d !== end; d = (d % 7) + 1) days.add(d);
    }
  }
  return [...days].sort((a, b) => a - b);
}

/** "sem lembrete", "não", "pular"… — declining the reminder in the last onboarding step. */
export const isNoReminder = (text: string) => /^(sem lembrete|nao|não|pular|pula|nenhum|nenhuma|n)\b/i.test(text.trim());

/** The goals message goes out this many minutes before the user's training time. */
export const REMINDER_LEAD_MIN = 30;

/** `reminderTime` is the training time; the reminder is due REMINDER_LEAD_MIN before it (possibly the evening before). */
export function isReminderDue(local: LocalTime, reminderTime: string, trainingDays: number[]) {
  let target = parseClock(reminderTime) - REMINDER_LEAD_MIN;
  let trainingWeekday = local.isoWeekday;
  if (target < 0) {
    // Training shortly after midnight: the reminder fires the previous evening, for the next day's training.
    target += 24 * 60;
    trainingWeekday = (local.isoWeekday % 7) + 1;
  }
  if (!trainingDays.includes(trainingWeekday)) return false;
  const delta = local.minutes - target;
  return delta >= 0 && delta < REMINDER_WINDOW_MIN;
}
