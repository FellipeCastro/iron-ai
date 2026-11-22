import { describe, expect, it } from "vitest";
import type { RoutineDay } from "@/lib/data/types";
import { applyRenamed, clampSets, isDirty, nextFreeLetter, removeDayAndReletter, routineSavePayload, searchExcluding } from "@/lib/routine-editor";

const ex = (id: string, name: string, plannedSets = 3) => ({ id, name, muscleGroup: "peito" as const, plannedSets, targets: [] });
const day = (letter: RoutineDay["letter"], title: string, exercises: RoutineDay["exercises"] = []): RoutineDay => ({ letter, title, exercises });

describe("routine editor rules", () => {
  it("clampSets keeps 1 to 6", () => {
    expect([0, 1, 3, 6, 7, -2].map(clampSets)).toEqual([1, 1, 3, 6, 6, 1]);
  });

  it("nextFreeLetter takes the first gap, none when all five are used", () => {
    expect(nextFreeLetter([day("A", "x"), day("C", "y")])).toBe("B");
    expect(nextFreeLetter([])).toBe("A");
    expect(nextFreeLetter(["A", "B", "C", "D", "E"].map((l) => day(l as RoutineDay["letter"], l)))).toBeUndefined();
  });

  it("removing a day re-letters the rest in order, keeping titles", () => {
    const days = [day("A", "Push"), day("B", "Pull"), day("C", "Legs")];
    expect(removeDayAndReletter(days, "B").map((d) => [d.letter, d.title])).toEqual([
      ["A", "Push"],
      ["B", "Legs"],
    ]);
  });

  it("isDirty compares the whole state", () => {
    const days = [day("A", "Push", [ex("1", "Supino")])];
    expect(isDirty(days, structuredClone(days))).toBe(false);
    expect(isDirty(days, [day("A", "Push", [ex("1", "Supino", 4)])])).toBe(true);
  });

  it("searchExcluding leaves out the given ids", () => {
    const catalog = [
      { id: "1", name: "Supino reto", muscleGroup: "peito" as const },
      { id: "2", name: "Supino inclinado", muscleGroup: "peito" as const },
    ];
    expect(searchExcluding(catalog, new Set(["1"]), "supino").map((r) => r.id)).toEqual(["2"]);
  });

  it("the save payload only carries names the user changed", () => {
    const saved = [day("A", "Push", [ex("1", "Supino"), ex("2", "Crucifixo")])];
    const days = [day("A", "Push", [ex("1", "Supino"), ex("2", "Crucifixo máquina", 4), ex("3", "   ")])];
    expect(routineSavePayload(days, saved)).toEqual([
      {
        title: "Push",
        exercises: [
          { id: "1", plannedSets: 3 },
          { id: "2", plannedSets: 4, name: "Crucifixo máquina" },
          { id: "3", plannedSets: 3 },
        ],
      },
    ]);
  });

  it("applyRenamed swaps in the new record and clears its targets", () => {
    const withTargets = { ...ex("1", "Supino"), targets: [{ position: 1, weight: 50, reps: 10 }] };
    const days = [day("A", "Push", [withTargets, ex("2", "Crucifixo")])];
    const next = applyRenamed(days, { "1": { id: "9", name: "Supino meu" } });
    expect(next[0].exercises[0]).toEqual({ ...withTargets, id: "9", name: "Supino meu", targets: [] });
    expect(next[0].exercises[1]).toBe(days[0].exercises[1]);
  });
});
