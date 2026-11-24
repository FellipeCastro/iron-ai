import { describe, expect, it } from "vitest";
import { addDays, dueReports, monthPeriods, periodsFor, retryReports, weekPeriods, zonedMidnight } from "@/lib/engine/periods";

const monday = (date: string, minutes: number) => ({ date, minutes, isoWeekday: 1 });
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

describe("periodsFor", () => {
  it("weekly report sent on Sunday covers the week ending that day", () => {
    const { current } = periodsFor("week", "2026-11-08", "UTC");
    expect([current.from, current.to]).toEqual(["2026-11-02", "2026-11-08"]);
  });

  it("monthly report sent on the first Sunday covers the previous month", () => {
    const { current } = periodsFor("month", "2026-11-01", "UTC");
    expect([current.from, current.to]).toEqual(["2026-10-01", "2026-10-31"]);
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
  it("nothing before 18:00 Sunday or on other days, Monday included", () => {
    expect(dueReports(sunday("2026-11-08", 17 * 60 + 59))).toEqual([]);
    expect(dueReports(monday("2026-11-09", 23 * 60 + 59))).toEqual([]);
    expect(dueReports({ date: "2026-11-07", minutes: 21 * 60, isoWeekday: 6 })).toEqual([]);
  });

  it("weekly on Sunday, still due late in the day", () => {
    expect(dueReports(sunday("2026-11-15", 18 * 60))).toEqual(["week"]);
    expect(dueReports(sunday("2026-11-15", 23 * 60 + 59))).toEqual(["week"]);
  });

  it("monthly joins on the first Sunday of the month", () => {
    expect(dueReports(sunday("2026-11-01", 18 * 60))).toEqual(["week", "month"]);
    expect(dueReports(sunday("2026-11-08", 18 * 60))).toEqual(["week"]);
  });
});

describe("retryReports", () => {
  it("retries Sunday's reports on Monday morning, targeting that Sunday", () => {
    expect(retryReports(monday("2026-11-16", 0))).toEqual([{ kind: "week", date: "2026-11-15" }]);
    expect(retryReports(monday("2026-11-02", 60))).toEqual([
      { kind: "week", date: "2026-11-01" },
      { kind: "month", date: "2026-11-01" },
    ]);
  });

  it("stops after the retry window and never runs on other days", () => {
    expect(retryReports(monday("2026-11-16", 12 * 60))).toEqual([]);
    expect(retryReports(sunday("2026-11-15", 23 * 60))).toEqual([]);
  });
});

describe("addDays", () => {
  it("crosses month ends", () => expect(addDays("2026-02-27", 3)).toBe("2026-03-02"));
});
