import { describe, expect, it } from "vitest";
import { fastParse, sameIntent } from "@/lib/ai/fast-parse";
import type { MatchCandidate } from "@/lib/engine/match";

const pool: MatchCandidate[] = [
  { id: "supino", name: "Supino reto", aliases: ["supino"], priority: 1 },
  { id: "crucifixo", name: "Crucifixo", aliases: [], priority: 0 },
  { id: "inv", name: "Crucifixo invertido", aliases: [], priority: 0 },
  { id: "rosca", name: "Rosca direta", aliases: ["rosca"], priority: 0 },
];
const get = async () => pool;

const groups = async (text: string) => {
  const r = await fastParse(text, get);
  return r && r.parsed.intent.type === "log_sets" ? r.parsed.intent.groups : null;
};

describe("fastParse", () => {
  it("reads sets x reps with load", async () => {
    expect(await groups("supino 3x10 20kg")).toEqual([{ exercise: "supino", exercise_named: true, weight_kg: 20, reps: 10, sets: 3 }]);
    expect(await groups("Supino 3x10 com 22,5 kg!")).toEqual([{ exercise: "supino", exercise_named: true, weight_kg: 22.5, reps: 10, sets: 3 }]);
  });

  it("reads a single set in the three one-set shapes", async () => {
    const one = [{ exercise: "supino", exercise_named: true, weight_kg: 20, reps: 10, sets: 1 }];
    expect(await groups("supino 10 reps 20kg")).toEqual(one);
    expect(await groups("supino 20kg x 10")).toEqual(one);
    expect(await groups("supino 10x20kg")).toEqual(one);
  });

  it("reads the finish messages", async () => {
    for (const text of ["terminei", "Acabei o treino!", "fim do treino", "encerra"]) {
      expect((await fastParse(text, get))?.parsed.intent.type).toBe("finish_workout");
    }
  });

  it("leaves everything ambiguous to the model", async () => {
    for (const text of [
      "supino 20kg", // reps missing
      "puxada 45kg 10 e 52kg 8", // two groups
      "mais uma de 9",
      "errei, supino 3x10 25kg", // correction
      "corrige supino 3x10 25kg",
      "terminei o supino", // not the end of the workout
      "supino 3x10 20", // no unit
      "supino 12x10 20kg", // 12 sets is out of range
      "supino 3x500 20kg", // reps out of range
      "bom dia",
    ]) {
      expect(await fastParse(text, get), text).toBeNull();
    }
  });

  it("declines when the exercise is unknown or ambiguous", async () => {
    expect(await fastParse("agachamento 3x10 20kg", get)).toBeNull();
    expect(await fastParse("crucifixo 3x10 20kg", get)).toMatchObject({ exerciseId: "crucifixo" });
  });

  it("does not load the catalog for messages that do not match a shape", async () => {
    let loaded = false;
    await fastParse("bom dia", async () => ((loaded = true), pool));
    expect(loaded).toBe(false);
  });
});

describe("sameIntent", () => {
  it("compares the shortcut with the model answer", async () => {
    const fast = (await fastParse("supino 3x10 20kg", get))!;
    const llm = (exercise: string, weight_kg: number | null, reps = 10) => ({
      intent: { type: "log_sets" as const, groups: [{ exercise, exercise_named: true, weight_kg, reps, sets: 3 }] },
      confidence: 0.9,
    });
    expect(sameIntent(fast, llm("Supino reto", 20), pool)).toBe(true);
    expect(sameIntent(fast, llm("Supino reto", 25), pool)).toBe(false);
    expect(sameIntent(fast, llm("Supino reto", 20, 8), pool)).toBe(false);
    expect(sameIntent(fast, llm("Rosca direta", 20), pool)).toBe(false);
  });
});
