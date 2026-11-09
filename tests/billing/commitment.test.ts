import { describe, expect, it } from "vitest";
import { addMonthsUtc, commitmentEnd } from "@/lib/commitment";

const utc = (iso: string) => new Date(`${iso}Z`);

describe("addMonthsUtc", () => {
  it("keeps the anchor day and time", () => {
    expect(addMonthsUtc(utc("2026-03-15T13:45:10"), 1)).toEqual(utc("2026-04-15T13:45:10"));
  });

  it("clamps to the last day of shorter months, counted from the original anchor", () => {
    const anchor = utc("2026-01-31T10:00:00");
    expect(addMonthsUtc(anchor, 1)).toEqual(utc("2026-02-28T10:00:00"));
    expect(addMonthsUtc(anchor, 2)).toEqual(utc("2026-03-31T10:00:00"));
    expect(addMonthsUtc(utc("2027-01-31T10:00:00"), 1)).toEqual(utc("2027-02-28T10:00:00"));
    expect(addMonthsUtc(utc("2028-01-31T10:00:00"), 1)).toEqual(utc("2028-02-29T10:00:00"));
  });

  it("crosses year boundaries", () => {
    expect(addMonthsUtc(utc("2026-11-20T00:00:00"), 12)).toEqual(utc("2027-11-20T00:00:00"));
    expect(addMonthsUtc(utc("2026-11-20T00:00:00"), 3)).toEqual(utc("2027-02-20T00:00:00"));
  });
});

describe("commitmentEnd", () => {
  const anchor = utc("2026-11-22T12:00:00");

  it("is 12 months after the anchor during the trial and the first cycle", () => {
    expect(commitmentEnd(anchor, utc("2026-11-10T00:00:00"))).toEqual(utc("2027-11-22T12:00:00"));
    expect(commitmentEnd(anchor, utc("2027-06-01T00:00:00"))).toEqual(utc("2027-11-22T12:00:00"));
  });

  it("moves to the next cycle once the current one ends", () => {
    expect(commitmentEnd(anchor, utc("2027-11-22T12:00:00"))).toEqual(utc("2028-11-22T12:00:00"));
    expect(commitmentEnd(anchor, utc("2030-01-01T00:00:00"))).toEqual(utc("2030-11-22T12:00:00"));
  });
});
