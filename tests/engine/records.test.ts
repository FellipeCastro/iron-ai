import { describe, expect, it } from "vitest";
import { matchExercise } from "@/lib/engine/match";
import { bestSet, markRecords } from "@/lib/engine/records";
import { exerciseReport, muscleGroupReport, recordsByExercise, sessionSummary, type ReportSet } from "@/lib/engine/reports";
import { isStagnant } from "@/lib/engine/stagnation";
import { estimateCalories } from "@/lib/format";

const l = (weight: number, reps: number) => ({ weight, reps });

describe("markRecords", () => {
  const s = (sessionId: string, weight: number, reps: number) => ({ sessionId, weight, reps });

  it("a lone set is the record", () => expect(markRecords([s("a", 50, 10)])).toEqual(["weight"]));

  it("the first session is a baseline when asked", () => expect(markRecords([s("a", 50, 10)], { includeFirst: false })).toEqual([null]));

  it("one record per session: its best set", () => {
    expect(markRecords([s("a", 70, 11), s("a", 90, 11), s("a", 110, 9)])).toEqual([null, null, "weight"]);
  });

  it("a later record does not take the earlier one away", () => {
    expect(markRecords([s("a", 50, 10), s("b", 52.5, 6), s("c", 60, 5)])).toEqual(["weight", "weight", "weight"]);
  });

  it("more reps at the same load is a reps record", () => {
    expect(markRecords([s("a", 50, 10), s("b", 50, 11)])).toEqual(["weight", "reps"]);
  });

  it("a session that does not beat the best has no record", () => {
    expect(markRecords([s("a", 52.5, 8), s("b", 50, 11), s("c", 52.5, 8)])).toEqual(["weight", null, null]);
  });
});

it("bestSet prefers load, then reps", () => {
  expect(bestSet([l(50, 12), l(55, 6), l(55, 8)])).toEqual(l(55, 8));
  expect(bestSet([])).toBeNull();
});

describe("isStagnant", () => {
  const s = (hasRecord: boolean) => ({ hasRecord });
  it("needs at least 4 sessions", () => expect(isStagnant([s(false), s(false), s(false)])).toBe(false));
  it("3 sessions without record", () => expect(isStagnant([s(false), s(false), s(false), s(true)])).toBe(true));
  it("a recent record clears it", () => expect(isStagnant([s(false), s(true), s(false), s(false)])).toBe(false));
});

describe("reports", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 0, n, 12));
  const mk = (sessionId: string, date: Date, weight: number, reps: number, setPosition = 1): ReportSet => ({
    exerciseId: "supino",
    exerciseName: "Supino reto com barra",
    muscleGroup: "peito",
    sessionId,
    setPosition,
    isExtra: false,
    createdAt: date,
    weight,
    reps,
  });
  const history = [mk("s1", day(1), 50, 10), mk("s2", day(3), 50, 11), mk("s3", day(5), 52.5, 8), mk("s3", day(5), 50, 12, 2)];

  it("summarizes a session with records and load-ups", () => {
    const summary = sessionSummary("s3", history, [{ exerciseId: "supino", setPosition: 1, before: l(50, 12), after: l(52.5, 9) }]);
    expect(summary.setCount).toBe(2);
    expect(summary.calories).toBeCloseTo(estimateCalories(52.5 * 8 + 50 * 12));
    expect(summary.records.map((r) => r.record)).toEqual(["weight"]);
    expect(summary.loadUps).toBe(1);
  });

  it("builds an exercise report", () => {
    const report = exerciseReport(history, "supino", day(6))!;
    expect(report.sessionCount).toBe(3);
    expect(report.record).toMatchObject({ weight: 52.5, reps: 8 });
    expect(report.latest).toMatchObject({ weight: 52.5, reps: 8 });
    expect(report.weightChange30d).toBe(2.5);
    expect(report.stagnant).toBe(false);
    expect(exerciseReport(history, "nada", day(6))).toBeNull();
  });

  it("flags an exercise as stagnant after 3 sessions without a record", () => {
    const flat = [mk("s1", day(1), 50, 10), mk("s2", day(3), 50, 10), mk("s3", day(5), 50, 10), mk("s4", day(7), 50, 10)];
    const report = exerciseReport(flat, "supino", day(8))!;
    expect(report.stagnant).toBe(true);
    expect(report.weightChange30d).toBe(0);
  });

  it("marks records per exercise, never across exercises", () => {
    const rosca = { ...mk("s1", day(1), 10, 10), exerciseId: "rosca", exerciseName: "Rosca direta", muscleGroup: "biceps" };
    const mixed = [mk("s1", day(1), 50, 10), rosca, mk("s2", day(3), 52.5, 8)];
    const records = recordsByExercise(mixed);
    expect(mixed.map((s) => records.get(s))).toEqual(["weight", "weight", "weight"]);
    expect(recordsByExercise(mixed, { includeFirst: false }).get(mixed[1])).toBeNull();
  });

  it("compares muscle groups against the previous period", () => {
    const now = day(20);
    const back = (id: string, date: Date, weight: number, reps: number): ReportSet => ({
      ...mk(id, date, weight, reps),
      exerciseId: "remada",
      exerciseName: "Remada curvada",
      muscleGroup: "costas",
    });
    const groups = muscleGroupReport(
      [mk("old", day(8), 40, 10), mk("a", day(18), 50, 10), mk("a", day(18), 50, 10), back("b", day(19), 30, 10)],
      now,
    );
    expect(groups.map((g) => g.group)).toEqual(["peito", "costas"]);
    expect(groups[0]).toMatchObject({ sets: 2, exercises: ["Supino reto com barra"] });
    expect(groups[0].calories).toBeCloseTo(estimateCalories(1000));
    expect(groups[0].previousCalories).toBeCloseTo(estimateCalories(400));
    expect(groups[1].previousCalories).toBe(0);
    expect(muscleGroupReport([mk("old", day(1), 40, 10)], now)).toEqual([]);
  });
});

describe("matchExercise", () => {
  const pool = [
    { id: "reto", name: "Supino reto com barra", aliases: ["supino", "supino reto"], priority: 0 },
    { id: "inclinado", name: "Supino inclinado com halteres", aliases: ["supino inclinado halter"], priority: 0 },
    { id: "rosca", name: "Rosca direta com barra", aliases: ["rosca direta"], priority: 0 },
    { id: "martelo", name: "Rosca martelo", aliases: ["martelo"], priority: 0 },
  ];

  it("exact alias", () => expect(matchExercise("Supino", pool).match?.id).toBe("reto"));
  it("ignores accents and case", () => expect(matchExercise("ROSCA MARTELO", pool).match?.id).toBe("martelo"));
  it("ambiguous returns candidates", () => {
    const r = matchExercise("rosca", pool);
    expect(r.match).toBeNull();
    expect(r.candidates.map((c) => c.id).sort()).toEqual(["martelo", "rosca"]);
  });
  it("prefers what is planned today", () => {
    const planned = pool.map((p) => (p.id === "inclinado" ? { ...p, priority: 2 } : p));
    expect(matchExercise("supino", planned).match?.id).toBe("inclinado");
  });
  it("no match", () => expect(matchExercise("agachamento", pool)).toEqual({ match: null, candidates: [] }));
});
