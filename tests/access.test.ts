import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {}, subscriptions: {}, users: {} }));

const { hasAccess, PAST_DUE_GRACE_MS } = await import("@/lib/services/access");

const NOW = new Date("2026-11-23T12:00:00Z").getTime();
const DAY = 86_400_000;
const at = (offsetMs: number) => new Date(NOW + offsetMs);

describe("hasAccess", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("a carência de past_due é de 7 dias", () => {
    expect(PAST_DUE_GRACE_MS).toBe(7 * DAY);
  });

  describe("past_due conta a carência de current_period_start, não de current_period_end", () => {
    const pastDue = (start: Date | null, end = at(30 * DAY), updatedAt?: Date) => ({
      status: "past_due",
      currentPeriodStart: start,
      currentPeriodEnd: end,
      updatedAt,
    });

    it("dentro dos 7 dias: tem acesso", () => {
      expect(hasAccess(pastDue(at(-6 * DAY)))).toBe(true);
      expect(hasAccess(pastDue(at(-7 * DAY + 1)))).toBe(true);
    });

    it("exatamente 7 dias depois: perde o acesso", () => {
      expect(hasAccess(pastDue(at(-7 * DAY)))).toBe(false);
    });

    it("plano anual com current_period_end daqui a ~1 ano: perde o acesso depois de 7 dias", () => {
      expect(hasAccess(pastDue(at(-8 * DAY), at(357 * DAY)))).toBe(false);
    });

    it("linha antiga sem current_period_start: usa updated_at", () => {
      expect(hasAccess(pastDue(null, at(30 * DAY), at(-2 * DAY)))).toBe(true);
      expect(hasAccess(pastDue(null, at(30 * DAY), at(-8 * DAY)))).toBe(false);
    });

    it("sem current_period_start nem updated_at: sem acesso", () => {
      expect(hasAccess(pastDue(null))).toBe(false);
    });

    it("complimentary ignora a carência", () => {
      expect(hasAccess(pastDue(at(-30 * DAY)), true)).toBe(true);
    });
  });

  it("active e trialing continuam presos a current_period_end", () => {
    expect(hasAccess({ status: "active", currentPeriodEnd: at(DAY) })).toBe(true);
    expect(hasAccess({ status: "active", currentPeriodEnd: at(-DAY) })).toBe(false);
    expect(hasAccess({ status: "trialing", currentPeriodEnd: at(-DAY) })).toBe(false);
  });

  it("status sem acesso continua bloqueado", () => {
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
      expect(hasAccess({ status, currentPeriodStart: at(0), currentPeriodEnd: at(30 * DAY) })).toBe(false);
    }
  });
});
