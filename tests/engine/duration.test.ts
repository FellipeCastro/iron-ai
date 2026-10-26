import { describe, expect, it } from "vitest";
import { parseDurationInput } from "@/lib/engine/duration";
import { parseTimeInput } from "@/lib/engine/reminders";

describe("parseDurationInput", () => {
  it("reads plain minutes", () => {
    expect(parseDurationInput("50")).toBe(50);
    expect(parseDurationInput("50 min")).toBe(50);
  });
  it("reads hours and minutes", () => {
    expect(parseDurationInput("1h")).toBe(60);
    expect(parseDurationInput("1h10")).toBe(70);
    expect(parseDurationInput("1:10")).toBe(70);
    expect(parseDurationInput("1h 10min")).toBe(70);
  });
  it("rejects nonsense and out-of-range values", () => {
    expect(parseDurationInput("0")).toBeNull();
    expect(parseDurationInput("700")).toBeNull();
    expect(parseDurationInput("supino 3x10")).toBeNull();
  });
});

describe("parseTimeInput", () => {
  it("normalizes to HH:MM", () => {
    expect(parseTimeInput("18:30")).toBe("18:30");
    expect(parseTimeInput("18h")).toBe("18:00");
    expect(parseTimeInput("7h15")).toBe("07:15");
    expect(parseTimeInput("às 19")).toBe("19:00");
  });
  it("rejects what is not a time", () => {
    expect(parseTimeInput("25:00")).toBeNull();
    expect(parseTimeInput("18:75")).toBeNull();
    expect(parseTimeInput("de manhã")).toBeNull();
  });
});
