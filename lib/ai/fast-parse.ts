import { matchExercise, type MatchCandidate } from "@/lib/engine/match";
import { ParsedMessage, validateIntent } from "./schemas";

// Deterministic shortcut for the most common messages, so they skip the LLM (and its cost, latency and
// budget). It only answers when a strict pattern matches AND the exercise resolves unambiguously; anything
// else returns null and goes to the model. FAST_PATH=off|shadow|on (default shadow: the model still answers
// and the two results are compared, see sameIntent).

export type FastPathMode = "off" | "shadow" | "on";

export function fastPathMode(): FastPathMode {
  const raw = process.env.FAST_PATH;
  return raw === "off" || raw === "on" || raw === "shadow" ? raw : "shadow";
}

export type FastParse = { parsed: ParsedMessage; exerciseId?: string };

const CONFIDENCE = 0.95;

/** Lowercase, no accents, single spaces, no trailing punctuation. Keeps digits, "," and "." for decimals. */
const clean = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s.!?]+$/, "")
    .trim();

const FINISH =
  /^(?:(?:terminei|acabei|finalizei|encerrei)(?: o)?(?: treino)?|encerra(?:r)?(?: o)?(?: treino)?|fim do treino|treino (?:finalizado|encerrado))$/;

// Letters and spaces only, 1-4 words: the exercise name as typed.
const NAME = "([a-z]+(?: [a-z]+){0,3})";
const NUM = "(\\d+(?:[.,]\\d+)?)";
const KG = "(?:kgs?|kilos?|quilos?)";

type Shape = { re: RegExp; read: (m: RegExpMatchArray) => { sets: number; reps: number; weight: string } };
const SHAPES: Shape[] = [
  // "supino 3x10 20kg", "supino 3x10 com 20kg": sets x reps load
  { re: new RegExp(`^${NAME} (\\d{1,2}) ?x ?(\\d{1,3}) (?:com )?${NUM} ?${KG}$`), read: (m) => ({ sets: +m[2], reps: +m[3], weight: m[4] }) },
  // "supino 10 reps 20kg", "supino 10 repeticoes com 20kg": one set
  { re: new RegExp(`^${NAME} (\\d{1,3}) (?:reps?|repeticoes) (?:com |de )?${NUM} ?${KG}$`), read: (m) => ({ sets: 1, reps: +m[2], weight: m[3] }) },
  // "supino 20kg x 10", "supino 20kg 10 reps": load first, one set
  { re: new RegExp(`^${NAME} ${NUM} ?${KG} (?:x |por )?(\\d{1,3})(?: reps?| repeticoes)?$`), read: (m) => ({ sets: 1, reps: +m[3], weight: m[2] }) },
  // "supino 10x20kg": reps x load, one set
  { re: new RegExp(`^${NAME} (\\d{1,3}) ?x ?${NUM} ?${KG}$`), read: (m) => ({ sets: 1, reps: +m[2], weight: m[3] }) },
];

// Words that mean the message is a correction or leans on conversation context: leave those to the model.
const NOT_A_NAME = /\b(errei|erro|corrig\w*|apag\w*|remov\w*|delet\w*|troc\w*|foi|era|nao|mais|uma|outra|agora|fiz|fez|ultima|ultimo)\b/;

/** Returns the intent when the message is one of the shortcut shapes, null when the model must read it. */
export async function fastParse(text: string, getPool: () => Promise<MatchCandidate[]>): Promise<FastParse | null> {
  const t = clean(text);
  if (FINISH.test(t)) return { parsed: { intent: { type: "finish_workout" }, confidence: 1 } };

  for (const { re, read } of SHAPES) {
    const m = t.match(re);
    if (!m) continue;
    const name = m[1];
    if (NOT_A_NAME.test(name)) return null;
    const { sets, reps, weight } = read(m);
    const parsed = validateIntent({
      intent: { type: "log_sets", groups: [{ exercise: name, exercise_named: true, weight_kg: Number(weight.replace(",", ".")), reps, sets }] },
      confidence: CONFIDENCE,
    });
    if (parsed.intent.type !== "log_sets") return null; // out of range: let the model ask
    const hit = matchExercise(name, await getPool()).match;
    return hit ? { parsed, exerciseId: hit.id } : null;
  }
  return null;
}

/** Shadow mode: does the model's answer say the same thing as the shortcut? */
export function sameIntent(fast: FastParse, llm: ParsedMessage, pool: MatchCandidate[]) {
  const a = fast.parsed.intent;
  const b = llm.intent;
  if (a.type === "finish_workout") return b.type === "finish_workout";
  if (a.type !== "log_sets" || b.type !== "log_sets" || b.groups.length !== 1) return false;
  const [x] = a.groups;
  const [y] = b.groups;
  return (
    x.sets === y.sets &&
    x.reps === y.reps &&
    x.weight_kg === y.weight_kg &&
    matchExercise(y.exercise, pool).match?.id === fast.exerciseId
  );
}
