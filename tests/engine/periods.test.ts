import { describe, expect, it } from "vitest";
import { addDays, dueReports, monthPeriods, periodsFor, retryReports, weekPeriods, zonedMidnight } from "@/lib/engine/periods";

const monday = (date: string, minutes: number) => ({ date, minutes, isoWeekday: 1 });

describe("zonedMidnight", () => {
  it("is local midnight as an instant", () => {
    expect(zonedMidnight("2026-11-08", "America/Sao_Paulo").toISOString()).toBe("2026-11-08T03:00:00.000Z");
    expect(zonedMidnight("2026-11-08", "UTC").toISOString()).toBe("2026-11-08T00:00:00.000Z");
  });

  it("follows a DST shift", () => {
    // New York leaves DST on 2026-11-01 (Sunday): midnight is still EDT (UTC−4), the next day EST (UTC−5).
    expect(zonedMidnight("2026-11-01", "America/New_York").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(zonedMidnight("2026-11-02", "America/New_York").toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
});

describe("weekPeriods", () => {
  it("runs Monday to Sunday and compares with the week before", () => {
    // 2026-11-08 is a Sunday.
    const { current, previous } = weekPeriods("2026-11-08", "UTC");
    expect([current.from, current.to]).toEqual(["2026-11-02", "2026-11-08"]);
    expect([previous.from, previous.to]).toEqual(["2026-10-26", "2026-11-01"]);
    expect(current.start).toEqual(previous.end);
    expect(current.end.toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });
});

describe("periodsFor", () => {
  it("weekly report sent on Monday covers the week that ended yesterday", () => {
    const { current } = periodsFor("week", "2026-11-09", "UTC");
    expect([current.from, current.to]).toEqual(["2026-11-02", "2026-11-08"]);
  });
});

describe("monthPeriods", () => {
  it("reports the month that just ended, against the one before", () => {
    const { current, previous } = monthPeriods("2026-11-01", "UTC");
    expect([current.from, current.to]).toEqual(["2026-10-01", "2026-10-31"]);
    expect([previous.from, previous.to]).toEqual(["2026-09-01", "2026-09-30"]);
  });

  it("crosses the year boundary", () => {
    const { current, previous } = monthPeriods("2027-01-03", "UTC");
    expect([current.from, current.to]).toEqual(["2026-12-01", "2026-12-31"]);
    expect([previous.from, previous.to]).toEqual(["2026-11-01", "2026-11-30"]);
  });
});

describe("dueReports", () => {
  it("nothing before 09:00 Monday or on other days, Sunday included", () => {
    expect(dueReports(monday("2026-11-09", 8 * 60 + 59))).toEqual([]);
    expect(dueReports({ date: "2026-11-08", minutes: 23 * 60 + 59, isoWeekday: 7 })).toEqual([]);
    expect(dueReports({ date: "2026-11-10", minutes: 21 * 60, isoWeekday: 2 })).toEqual([]);
  });

  it("weekly on Monday, still due late in the day", () => {
    expect(dueReports(monday("2026-11-16", 9 * 60))).toEqual(["week"]);
    expect(dueReports(monday("2026-11-16", 23 * 60 + 59))).toEqual(["week"]);
  });

  it("monthly joins on the first Monday of the month", () => {
    expect(dueReports(monday("2026-11-02", 9 * 60))).toEqual(["week", "month"]);
    expect(dueReports(monday("2026-11-09", 9 * 60))).toEqual(["week"]);
  });
});

describe("retryReports", () => {
  const tuesday = (date: string, minutes: number) => ({ date, minutes, isoWeekday: 2 });

  it("retries Monday's reports on Tuesday morning, targeting that Monday", () => {
    expect(retryReports(tuesday("2026-11-17", 0))).toEqual([{ kind: "week", date: "2026-11-16" }]);
    expect(retryReports(tuesday("2026-11-03", 60))).toEqual([
      { kind: "week", date: "2026-11-02" },
      { kind: "month", date: "2026-11-02" },
    ]);
  });

  it("stops after the retry window and never runs on other days", () => {
    expect(retryReports(tuesday("2026-11-17", 12 * 60))).toEqual([]);
    expect(retryReports(monday("2026-11-16", 23 * 60))).toEqual([]);
  });
});

describe("addDays", () => {
  it("crosses month ends", () => expect(addDays("2026-02-27", 3)).toBe("2026-03-02"));
});
