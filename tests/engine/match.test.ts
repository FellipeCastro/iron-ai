import { describe, expect, it } from "vitest";
import { matchExercise, rankPool } from "@/lib/engine/match";

const ex = (id: string, name: string, aliases: string[] = []) => ({ id, name, aliases });
const none = { routine: [], today: [], session: [] };

describe("rankPool", () => {
  const catalog = [ex("a", "Supino reto"), ex("b", "Crucifixo"), ex("c", "Rosca direta"), ex("d", "Remada"), ex("e", "Agachamento")];
  const priorities = (ids: Parameters<typeof rankPool>[1]) => Object.fromEntries(rankPool(catalog, ids).map((c) => [c.id, c.priority]));

  it("gives 0 to everything outside the routine and the workout", () => {
    expect(priorities(none)).toEqual({ a: 0, b: 0, c: 0, d: 0, e: 0 });
  });

  it("ranks routine (1) < today (2) < logged in this workout (3) < in progress (4)", () => {
    expect(priorities({ routine: ["a", "b", "c", "d"], today: ["b", "c", "d"], session: ["c", "d"] })).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 0 });
  });

  it("takes the last logged exercise as the one in progress", () => {
    expect(priorities({ ...none, session: ["a", "b", "a"] })).toEqual({ a: 4, b: 3, c: 0, d: 0, e: 0 });
  });

  it("keeps the highest level when an exercise is in several lists", () => {
    expect(priorities({ routine: ["a"], today: ["a"], session: [] }).a).toBe(2);
    expect(priorities({ routine: ["a"], today: ["a"], session: ["a"] }).a).toBe(4);
  });

  it("ignores ids that are not in the catalog and keeps the catalog order and fields", () => {
    const ranked = rankPool(catalog, { routine: ["zzz"], today: [], session: ["yyy"] });
    expect(ranked.map((c) => c.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(ranked.map((c) => c.priority)).toEqual([0, 0, 0, 0, 0]);
    expect(ranked[0]).toEqual({ id: "a", name: "Supino reto", aliases: [], priority: 0 });
  });

  it("makes a short name stay on the exercise in progress instead of a catalog namesake", () => {
    const pool = [ex("inv", "Crucifixo invertido"), ex("cat", "Crucifixo máquina")];
    expect(matchExercise("crucifixo", rankPool(pool, none)).match).toBeNull();
    expect(matchExercise("crucifixo", rankPool(pool, { ...none, session: ["inv"] })).match?.id).toBe("inv");
  });
});
