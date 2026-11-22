import { describe, expect, it } from "vitest";
import { assignSet, findDayByQuery, isInactive, isSessionComplete, nextDay, nextExerciseFor, pickDayForSession, planSetRows, remainingNames, remainingSets, upNextFor, type PlanDay } from "@/lib/engine/session";

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

describe("planSetRows", () => {
  const input = (exerciseId: string, weight: number | null, reps: number, count = 1) => ({ exerciseId, weight, reps, count });
  const noTargets = new Map<string, { position: number; weight: number }[]>();

  it("repeats each input `count` times, numbering after the session's sets and marking extras", () => {
    const session = [{ exerciseId: "supino", setPosition: 1, isExtra: false }];
    expect(planSetRows(days[0], session, [], noTargets, [input("supino", 50, 10, 2), input("remada", 40, 8)])).toEqual([
      { exerciseId: "supino", setPosition: 2, isExtra: false, weight: 50, reps: 10 },
      { exerciseId: "supino", setPosition: 3, isExtra: true, weight: 50, reps: 10 },
      { exerciseId: "remada", setPosition: 1, isExtra: true, weight: 40, reps: 8 },
    ]);
  });

  it("no load said: target for the position, else last load used, else 0", () => {
    const targets = new Map([["supino", [{ position: 2, weight: 60 }]]]);
    const prior = [
      { exerciseId: "supino", weight: 45 },
      { exerciseId: "triceps", weight: 20 },
    ];
    const rows = planSetRows(null, [], prior, targets, [input("supino", null, 10, 3), input("triceps", null, 12), input("rosca", null, 8)]);
    expect(rows.map((r) => r.weight)).toEqual([45, 60, 60, 20, 0]);
  });

  it("a load said in the same call becomes the default for the next input", () => {
    const rows = planSetRows(null, [], [{ exerciseId: "supino", weight: 40 }], noTargets, [input("supino", 50, 10), input("supino", null, 8)]);
    expect(rows.map((r) => r.weight)).toEqual([50, 50]);
  });

  it("an explicit load wins over the target", () => {
    const targets = new Map([["supino", [{ position: 1, weight: 60 }]]]);
    expect(planSetRows(null, [], [], targets, [input("supino", 0, 15)])[0].weight).toBe(0);
  });
});

describe("what comes next", () => {
  const day = {
    id: "a",
    letter: "A",
    position: 1,
    exercises: [
      { exerciseId: "supino", plannedSets: 2, name: "Supino" },
      { exerciseId: "triceps", plannedSets: 2, name: "Tríceps" },
    ],
  };
  const done = (exerciseId: string, setPosition: number, isExtra = false) => ({ exerciseId, setPosition, isExtra });

  it("remainingNames lists missing sets with names, in plan order", () => {
    expect(remainingNames(day, [done("supino", 1)])).toEqual([
      { name: "Supino", missing: 1 },
      { name: "Tríceps", missing: 2 },
    ]);
    expect(remainingNames(null, [done("supino", 1)])).toEqual([]);
  });

  it("the rest of the exercise just logged comes first", () => {
    expect(nextExerciseFor(day, [done("supino", 1)], "supino")).toEqual({ exerciseId: "supino", kind: "same", name: "Supino", done: 1, missing: 1 });
  });

  it("once it is done, the first exercise still missing", () => {
    expect(nextExerciseFor(day, [done("supino", 1), done("supino", 2), done("triceps", 1)], "supino")).toEqual({
      exerciseId: "triceps",
      kind: "next",
      name: "Tríceps",
      done: 1,
      missing: 1,
    });
    // An exercise outside the plan also points at the first one missing.
    expect(nextExerciseFor(day, [done("rosca", 1, true)], "rosca")).toMatchObject({ exerciseId: "supino", kind: "next", done: 0, missing: 2 });
  });

  it("nothing next without a day or when every planned set is done", () => {
    expect(nextExerciseFor(null, [], "supino")).toBeNull();
    expect(nextExerciseFor(day, [done("supino", 1), done("supino", 2), done("triceps", 1), done("triceps", 2)], "triceps")).toBeNull();
  });

  it("upNextFor picks the targets of the missing positions; no target is null", () => {
    const next = { exerciseId: "triceps", kind: "next" as const, name: "Tríceps", done: 1, missing: 2 };
    const byPosition = new Map([
      [1, { weight: 20, reps: 10 }],
      [2, { weight: 22.5, reps: 8 }],
    ]);
    expect(upNextFor(next, byPosition)).toEqual({ kind: "next", name: "Tríceps", targets: [{ weight: 22.5, reps: 8 }, null] });
  });

  it("upNextFor keeps the target objects as given", () => {
    const target = { weight: 20, reps: 10, position: 1 };
    const next = { exerciseId: "supino", kind: "same" as const, name: "Supino", done: 0, missing: 1 };
    expect(upNextFor(next, new Map([[1, target]])).targets[0]).toBe(target);
  });
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

describe("findDayByQuery", () => {
  const named = [
    { letter: "A", position: 1, title: "Push" },
    { letter: "B", position: 2, title: "Pull" },
    { letter: "D", position: 4, title: "Upper" },
  ];
  it("matches the letter", () => expect(findDayByQuery(named, "treino B")?.letter).toBe("B"));
  it("matches the title", () => expect(findDayByQuery(named, "treino push")?.letter).toBe("A"));
  it("matches letter and title together", () => expect(findDayByQuery(named, "A push")?.letter).toBe("A"));
  it("ignores accents and case", () => expect(findDayByQuery(named, "UPPER")?.letter).toBe("D"));
  it("returns null for unknown or empty queries", () => {
    expect(findDayByQuery(named, "perna")).toBeNull();
    expect(findDayByQuery(named, "treino")).toBeNull();
  });
  it("returns null on a tie", () => expect(findDayByQuery(named, "push pull")).toBeNull());
});
