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

export function isReminderDue(local: LocalTime, reminderTime: string, trainingDays: number[]) {
  if (!trainingDays.includes(local.isoWeekday)) return false;
  const delta = local.minutes - parseClock(reminderTime);
  return delta >= 0 && delta < REMINDER_WINDOW_MIN;
}
