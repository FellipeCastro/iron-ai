// Reminder timing, evaluated by the 5-minute cron in each user's timezone.

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

export function isReminderDue(local: LocalTime, reminderTime: string, trainingDays: number[]) {
  if (!trainingDays.includes(local.isoWeekday)) return false;
  const delta = local.minutes - parseClock(reminderTime);
  return delta >= 0 && delta < REMINDER_WINDOW_MIN;
}
