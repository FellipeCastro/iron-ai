import { describe, expect, it } from "vitest";
import { isReminderDue, localTime, parseClock } from "@/lib/engine/reminders";

describe("localTime", () => {
  it("converts to the user's timezone", () => {
    // 2026-03-02 is a Monday; 01:30 UTC is still Sunday 22:30 in São Paulo (UTC−3).
    expect(localTime(new Date("2026-03-02T01:30:00Z"), "America/Sao_Paulo")).toEqual({ date: "2026-03-01", minutes: 22 * 60 + 30, isoWeekday: 7 });
    expect(localTime(new Date("2026-03-02T12:05:00Z"), "UTC")).toEqual({ date: "2026-03-02", minutes: 12 * 60 + 5, isoWeekday: 1 });
  });
});

describe("isReminderDue", () => {
  const monday = (minutes: number) => ({ date: "2026-03-02", minutes, isoWeekday: 1 });

  it("parses clock strings", () => expect(parseClock("18:30:00")).toBe(1110));
  it("not before the time", () => expect(isReminderDue(monday(1109), "18:30", [1])).toBe(false));
  it("at and after the time", () => {
    expect(isReminderDue(monday(1110), "18:30", [1])).toBe(true);
    expect(isReminderDue(monday(1200), "18:30:00", [1, 3])).toBe(true);
  });
  it("not after the window", () => expect(isReminderDue(monday(1110 + 120), "18:30", [1])).toBe(false));
  it("only on training days", () => expect(isReminderDue(monday(1110), "18:30", [2, 4])).toBe(false));
});
