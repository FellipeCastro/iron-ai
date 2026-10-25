// Maps the exercise name the user typed (as extracted by the parser) to a catalog exercise.
// Deterministic: exact name/alias first, then token overlap; ambiguity is returned, never guessed.

export type MatchCandidate = { id: string; name: string; aliases: string[]; priority: number };

export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOPWORDS = new Set(["de", "da", "do", "com", "na", "no", "em", "a", "o", "e", "para"]);
const tokens = (text: string) =>
  normalize(text)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t));

function score(query: string, candidate: MatchCandidate) {
  const q = normalize(query);
  const names = [candidate.name, ...candidate.aliases].map(normalize);
  if (names.includes(q)) return 100;
  const qt = tokens(query);
  if (qt.length === 0) return 0;
  let best = 0;
  for (const name of names) {
    const nt = tokens(name);
    const hits = qt.filter((t) => nt.some((n) => n === t || (t.length >= 4 && n.startsWith(t)))).length;
    if (hits === 0) continue;
    // Share of the query covered, minus a small penalty for extra words in the candidate.
    best = Math.max(best, (hits / qt.length) * 80 - (nt.length - hits) * 2);
  }
  return best;
}

export type MatchResult<C> = { match: C; candidates: C[] } | { match: null; candidates: C[] };

/**
 * `priority` boosts exercises of today's plan (2) and the rest of the routine (1) over the catalog (0), so
 * "supino" means the bench press the user actually has planned. A match needs good query coverage and a
 * clear lead over the runner-up; otherwise the top candidates are returned for the user to pick.
 */
export function matchExercise<C extends MatchCandidate>(query: string, pool: C[]): MatchResult<C> {
  const ranked = pool
    .map((c) => {
      const s = score(query, c);
      return { c, s, total: s + c.priority * 20 };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.total - a.total);

  const candidates = ranked.slice(0, 4).map((x) => x.c);
  const [first, second] = ranked;
  if (!first) return { match: null, candidates };
  const clearLead = !second || first.total - second.total >= 10;
  return first.s >= 70 && clearLead ? { match: first.c, candidates } : { match: null, candidates };
}
