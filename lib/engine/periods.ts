import { localTime, type LocalTime } from "./reminders";

// Calendar periods of the automatic weekly/monthly reports, in the user's timezone. Dates are "YYYY-MM-DD".

export type ReportKind = "week" | "month";

/** Reports go out on Sunday at this local time (minutes since midnight), so the week is nearly over. */
export const REPORT_MINUTE = 20 * 60;

export type Period = {
  /** First local date of the period. Also the dedupe key. */
  from: string;
  /** Last local date of the period (inclusive). */
  to: string;
  /** Start instant (local midnight of `from`) and exclusive end instant (local midnight after `to`). */
  start: Date;
  end: Date;
};

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** First day of the month `offset` months from the month of `date`. */
function firstOfMonth(date: string, offset: number) {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 10);
}

/** Instant of local midnight at the start of `date` in `timeZone` (handles zones with a DST shift). */
export function zonedMidnight(date: string, timeZone: string) {
  const wanted = Date.parse(`${date}T00:00:00Z`);
  let t = wanted;
  // Two passes settle on the right offset, even when it changes between the guess and the answer.
  for (let i = 0; i < 2; i++) {
    const local = localTime(new Date(t), timeZone);
    t += wanted - (Date.parse(`${local.date}T00:00:00Z`) + local.minutes * 60_000);
  }
  return new Date(t);
}

function period(from: string, until: string, timeZone: string): Period {
  return { from, to: addDays(until, -1), start: zonedMidnight(from, timeZone), end: zonedMidnight(until, timeZone) };
}

/** Monday to Sunday ending on `sunday`, and the week before it. */
export function weekPeriods(sunday: string, timeZone: string) {
  const monday = addDays(sunday, -6);
  return {
    current: period(monday, addDays(sunday, 1), timeZone),
    previous: period(addDays(monday, -7), monday, timeZone),
  };
}

/** The calendar month before the one `date` is in, and the month before that. */
export function monthPeriods(date: string, timeZone: string) {
  const thisMonth = firstOfMonth(date, 0);
  const lastMonth = firstOfMonth(date, -1);
  return {
    current: period(lastMonth, thisMonth, timeZone),
    previous: period(firstOfMonth(date, -2), lastMonth, timeZone),
  };
}

/**
 * Reports due at this local time. The weekly one goes every Sunday from REPORT_MINUTE on (a late run still
 * sends it the same evening); the monthly one rides along on the first Sunday of the month, when the previous
 * month is complete.
 */
export function dueReports(local: LocalTime): ReportKind[] {
  if (local.isoWeekday !== 7 || local.minutes < REPORT_MINUTE) return [];
  return Number(local.date.slice(8)) <= 7 ? ["week", "month"] : ["week"];
}

export function periodsFor(kind: ReportKind, localDate: string, timeZone: string) {
  return kind === "week" ? weekPeriods(localDate, timeZone) : monthPeriods(localDate, timeZone);
}
