import { describe, expect, it } from "vitest";
import { advance, computeTargets, hitTarget, nextTarget, roundKg } from "@/lib/engine/progression";

const set = (setPosition: number, weight: number, reps: number, isExtra = false) => ({ setPosition, weight, reps, isExtra });

describe("nextTarget", () => {
  it("first set is the baseline: the target is what was done", () => {
    expect(nextTarget(null, { weight: 20, reps: 10 }, 2.5)).toEqual({ weight: 20, reps: 10 });
  });

  it("baseline at 12 reps stays at 12; hitting it next time jumps the load", () => {
    expect(nextTarget(null, { weight: 20, reps: 12 }, 2.5)).toEqual({ weight: 20, reps: 12 });
    expect(nextTarget({ weight: 20, reps: 12 }, { weight: 20, reps: 12 }, 2.5)).toEqual({ weight: 22.5, reps: 6 });
  });

  it("hit → +1 rep", () => {
    expect(nextTarget({ weight: 50, reps: 9 }, { weight: 50, reps: 9 }, 2.5)).toEqual({ weight: 50, reps: 10 });
  });

  it("hit at 12 → load + increment, reps 8", () => {
    expect(nextTarget({ weight: 50, reps: 12 }, { weight: 50, reps: 12 }, 2.5)).toEqual({ weight: 52.5, reps: 6 });
  });

  it("more reps than asked advances from what was done", () => {
    expect(nextTarget({ weight: 50, reps: 9 }, { weight: 50, reps: 12 }, 5)).toEqual({ weight: 55, reps: 6 });
  });

  it("missed reps keeps the target", () => {
    expect(nextTarget({ weight: 50, reps: 10 }, { weight: 50, reps: 8 }, 2.5)).toEqual({ weight: 50, reps: 10 });
  });

  it("lighter load keeps the target", () => {
    expect(nextTarget({ weight: 50, reps: 10 }, { weight: 45, reps: 12 }, 2.5)).toEqual({ weight: 50, reps: 10 });
  });

  it("heavier load with fewer reps rebases on the new load", () => {
    expect(nextTarget({ weight: 50, reps: 10 }, { weight: 55, reps: 8 }, 2.5)).toEqual({ weight: 55, reps: 9 });
  });
});

describe("helpers", () => {
  it("hitTarget", () => {
    expect(hitTarget({ weight: 20, reps: 10 }, { weight: 20, reps: 10 })).toBe(true);
    expect(hitTarget({ weight: 20, reps: 10 }, { weight: 20, reps: 9 })).toBe(false);
    expect(hitTarget({ weight: 20, reps: 10 }, { weight: 22.5, reps: 6 })).toBe(true);
  });

  it("roundKg keeps 0.25 precision", () => {
    expect(roundKg(21.3)).toBe(21.25);
    expect(advance({ weight: 10.1, reps: 12 }, 1.25)).toEqual({ weight: 11.25, reps: 6 });
  });
});

describe("computeTargets", () => {
  it("tracks each set position independently", () => {
    const t = computeTargets([set(1, 20, 10), set(2, 20, 9), set(3, 20, 8)], 2.5);
    expect(t.get(1)).toMatchObject({ weight: 20, reps: 10 });
    expect(t.get(2)).toMatchObject({ weight: 20, reps: 9 });
    expect(t.get(3)).toMatchObject({ weight: 20, reps: 8 });
  });

  it("ignores extra sets", () => {
    const t = computeTargets([set(1, 20, 10), set(2, 40, 12, true)], 2.5);
    expect(t.get(1)).toMatchObject({ weight: 20, reps: 10 });
    expect(t.has(2)).toBe(false);
  });

  it("a correction cascades into later targets", () => {
    // Session 1: 20×10 → baseline, target 20×10. Session 2: 20×11 beats it → target 20×12.
    const original = [set(1, 20, 10), set(1, 20, 11)];
    expect(computeTargets(original, 2.5).get(1)).toMatchObject({ weight: 20, reps: 12 });

    // The first set was actually 25 kg: the baseline becomes 25×10, and 20×11 later is a lighter (missed) set.
    const corrected = [set(1, 25, 10), set(1, 20, 11)];
    expect(computeTargets(corrected, 2.5).get(1)).toMatchObject({ weight: 25, reps: 10 });
  });

  it("points at the set that produced the target", () => {
    const log = [set(1, 20, 10), set(1, 20, 10)];
    expect(computeTargets(log, 2.5).get(1)!.source).toBe(log[1]);
  });
});
