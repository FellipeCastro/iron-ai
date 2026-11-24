import { localTime, type LocalTime } from "./reminders";

// Calendar periods of the automatic weekly/monthly reports, in the user's timezone. Dates are "YYYY-MM-DD".

export type ReportKind = "week" | "month";

/** Reports go out on Sunday (ISO weekday 7) from this local time (minutes since midnight), closing the week. */
export const REPORT_WEEKDAY = 7;
export const REPORT_MINUTE = 18 * 60;

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
 * sends it the same day), for the week ending that day; the monthly one rides along on the first Sunday of
 * the month, when the previous month is complete.
 */
export function dueReports(local: LocalTime): ReportKind[] {
  if (local.isoWeekday !== REPORT_WEEKDAY || local.minutes < REPORT_MINUTE) return [];
  return Number(local.date.slice(8)) <= 7 ? ["week", "month"] : ["week"];
}

/** Monday morning, until this local time (minutes since midnight), still retries Sunday's reports that went unsent. */
export const RETRY_UNTIL_MINUTE = 12 * 60;

/**
 * Retries of Sunday's reports, due on Monday morning: a send that failed in the last Sunday run had its claim
 * released, and no later run would be a Sunday. `date` is that Sunday, the one to pass to `periodsFor`. Reports
 * already claimed (sent, skipped or blocked) are no-ops at the claim, so this never resends.
 */
export function retryReports(local: LocalTime): { kind: ReportKind; date: string }[] {
  if (local.isoWeekday !== (REPORT_WEEKDAY % 7) + 1 || local.minutes >= RETRY_UNTIL_MINUTE) return [];
  const date = addDays(local.date, -1);
  return dueReports({ date, minutes: 24 * 60 - 1, isoWeekday: REPORT_WEEKDAY }).map((kind) => ({ kind, date }));
}

export function periodsFor(kind: ReportKind, localDate: string, timeZone: string) {
  // `localDate` is the Sunday the report goes out: the week it covers ends that day.
  return kind === "week" ? weekPeriods(localDate, timeZone) : monthPeriods(localDate, timeZone);
}
