import { describe, expect, it } from "vitest";
import { addDays, dueReports, monthPeriods, weekPeriods, zonedMidnight } from "@/lib/engine/periods";

const sunday = (date: string, minutes: number) => ({ date, minutes, isoWeekday: 7 });

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
  it("nothing before 20:00 or on other days", () => {
    expect(dueReports(sunday("2026-11-08", 19 * 60 + 59))).toEqual([]);
    expect(dueReports({ date: "2026-11-07", minutes: 21 * 60, isoWeekday: 6 })).toEqual([]);
  });

  it("weekly on Sunday evening, still due late at night", () => {
    expect(dueReports(sunday("2026-11-15", 20 * 60))).toEqual(["week"]);
    expect(dueReports(sunday("2026-11-15", 23 * 60 + 59))).toEqual(["week"]);
  });

  it("monthly joins on the first Sunday of the month", () => {
    expect(dueReports(sunday("2026-11-01", 20 * 60))).toEqual(["week", "month"]);
    expect(dueReports(sunday("2026-11-08", 20 * 60))).toEqual(["week"]);
  });
});

describe("addDays", () => {
  it("crosses month ends", () => expect(addDays("2026-02-27", 3)).toBe("2026-03-02"));
});
