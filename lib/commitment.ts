// The annual plan is billed as 12 monthly installments with a 12-month commitment. Stripe only sees a
// monthly price: the commitment lives here (cycle end) and in billing.ts (cancel_at on that date).

export const COMMITMENT_MONTHS = 12;

/**
 * Adds months in UTC the way Stripe advances monthly periods: always counted from the original anchor day
 * and clamped to the last day of shorter months (an anchor on Jan 31 bills Feb 28, then Mar 31).
 */
export function addMonthsUtc(anchor: Date, months: number) {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month, Math.min(anchor.getUTCDate(), lastDay), anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds()),
  );
}

/**
 * End of the commitment cycle in effect at `now`: the first anchor + 12k months strictly after it. The anchor is
 * Stripe's billing_cycle_anchor (the start, or the trial end for older trial subscriptions), so the date always falls on a period
 * end and cancelling there never leaves a partial month. Cycles renew: after 12 months a new one starts.
 */
export function commitmentEnd(anchor: Date, now = new Date()) {
  let cycles = 1;
  let end = addMonthsUtc(anchor, COMMITMENT_MONTHS);
  while (end <= now) end = addMonthsUtc(anchor, COMMITMENT_MONTHS * ++cycles);
  return end;
}
