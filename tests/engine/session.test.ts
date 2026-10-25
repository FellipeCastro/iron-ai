import { describe, expect, it } from "vitest";
import { assignSet, isInactive, isSessionComplete, nextDay, pickDayForSession, remainingSets, type PlanDay } from "@/lib/engine/session";

const days: PlanDay[] = [
  {
    id: "a",
    letter: "A",
    position: 1,
    exercises: [
      { exerciseId: "supino", plannedSets: 2 },
      { exerciseId: "triceps", plannedSets: 1 },
    ],
  },
  { id: "b", letter: "B", position: 2, exercises: [{ exerciseId: "remada", plannedSets: 3 }] },
  { id: "c", letter: "C", position: 3, exercises: [{ exerciseId: "agacha", plannedSets: 3 }] },
];

describe("rotation", () => {
  it("starts at the first day", () => expect(nextDay(days, null)?.letter).toBe("A"));
  it("follows the order", () => expect(nextDay(days, "A")?.letter).toBe("B"));
  it("wraps around", () => expect(nextDay(days, "C")?.letter).toBe("A"));
  it("unknown last letter restarts", () => expect(nextDay(days, "E")?.letter).toBe("A"));
  it("no days", () => expect(nextDay([], "A")).toBeNull());
});

describe("pickDayForSession", () => {
  it("uses the expected day when the exercise is in it", () => expect(pickDayForSession(days, "C", "supino")?.letter).toBe("A"));
  it("switches when the exercise belongs to one other day", () => expect(pickDayForSession(days, "C", "remada")?.letter).toBe("B"));
  it("keeps the expected day for unknown exercises", () => expect(pickDayForSession(days, "A", "rosca")?.letter).toBe("B"));
});

describe("assignSet", () => {
  it("numbers sets per exercise", () => {
    const sets = [{ exerciseId: "supino", setPosition: 1, isExtra: false }];
    expect(assignSet(days[0], sets, "supino")).toEqual({ setPosition: 2, isExtra: false });
  });

  it("sets beyond the plan are extra", () => {
    const sets = [1, 2].map((p) => ({ exerciseId: "supino", setPosition: p, isExtra: false }));
    expect(assignSet(days[0], sets, "supino")).toEqual({ setPosition: 3, isExtra: true });
  });

  it("exercises outside the day are extra", () => expect(assignSet(days[0], [], "remada")).toEqual({ setPosition: 1, isExtra: true }));
  it("without a routine nothing is extra", () => expect(assignSet(null, [], "remada")).toEqual({ setPosition: 1, isExtra: false }));
});

describe("completion", () => {
  it("lists what is missing and detects completion", () => {
    const sets = [
      { exerciseId: "supino", setPosition: 1, isExtra: false },
      { exerciseId: "supino", setPosition: 2, isExtra: false },
    ];
    expect(remainingSets(days[0], sets)).toEqual([{ exerciseId: "triceps", missing: 1 }]);
    expect(isSessionComplete(days[0], sets)).toBe(false);
    expect(isSessionComplete(days[0], [...sets, { exerciseId: "triceps", setPosition: 1, isExtra: false }])).toBe(true);
  });

  it("extra sets do not count toward completion", () => {
    expect(
      isSessionComplete(
        days[1],
        [1, 2, 3].map((p) => ({ exerciseId: "remada", setPosition: p, isExtra: true })),
      ),
    ).toBe(false);
  });
});

it("inactivity after 90 minutes", () => {
  const last = new Date("2026-01-01T10:00:00Z");
  expect(isInactive(last, new Date("2026-01-01T11:29:00Z"))).toBe(false);
  expect(isInactive(last, new Date("2026-01-01T11:30:00Z"))).toBe(true);
});
