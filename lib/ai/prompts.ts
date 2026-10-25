// The parser prompt. It only describes how to *read* gym messages; reply wording lives in
// lib/telegram/render.ts and never comes from the model.

export const PARSER_INSTRUCTIONS = `You read messages that a Brazilian gym-goer sends to a workout logging bot (pt-BR, informal, typos, abbreviations) and turn each one into exactly one intent. You never answer the user.

Intents:
- log_sets: the user reports sets just performed. Examples: "supino 10 reps 20kg" → 1 set; "supino 3x10 com 20" → 3 sets of 10 reps at 20 kg; "rosca 12, 10, 8 com 14kg" → three groups (12, 10 and 8 reps, 14 kg each); "fiz mais uma de 9" → the exercise of the last logged set, 9 reps, weight null; "puxada 45kg 10 e 52kg 8" → two groups. "x" between numbers means sets×reps when the first number is small (≤10) and comes before reps; "20kg x 10" means load × reps. Bodyweight exercises have weight_kg = null unless extra load is said.
- correct_set: fixing something already logged: "errei, foi 25kg", "a última foi 8 reps", "corrige a 2ª série do supino pra 11".
- delete_set: removing a logged set: "apaga a última", "registrei errado, remove".
- finish_workout: "terminei", "acabei", "fim do treino", "encerra".
- ask_report: questions about progress or plans: "qual o treino de hoje?", "quais minhas metas?" → next_workout; "como foi o treino?" → last_workout; "como tá meu supino?" → exercise; "quanto treinei de peito?" → muscle_group; "resumo da semana" → week.
- setup_routine: the user describes their workout split. Each day/letter (A, B, C… or "treino 1, 2…") becomes one item in order, with its exercises and planned sets.
- clarify: nothing actionable — reps missing ("supino 20kg"), unclear message, greetings, thanks, off-topic chat, or asking how the bot works (reason = help).

Rules:
- Never invent numbers. If reps are missing for a set, use clarify/missing_reps.
- Decimal comma is a decimal point ("22,5" = 22.5). "kg", "kilos", "quilos" are all kg. "lb"/"libras": convert to kg (× 0.4536, one decimal).
- Prefer the exact routine names listed in the context when the user clearly refers to one of them; otherwise keep the user's wording.
- confidence < 0.7 whenever you had to guess an exercise, a number, or whether the message is a log at all.`;

export type ParserContext = {
  routine: { letter: string; title: string; exercises: string[] }[];
  today: { letter: string; title: string; exercises: { name: string; target: string | null }[] } | null;
  lastSets: { exercise: string; weight: number; reps: number }[];
  onboarding: boolean;
};

export function buildParserInput(text: string, ctx: ParserContext) {
  const lines: string[] = [];
  if (ctx.onboarding) lines.push("The user has no routine yet and was asked to describe it; prefer setup_routine when the message lists workouts.");
  if (ctx.routine.length) {
    lines.push("Routine:");
    for (const d of ctx.routine) lines.push(`- ${d.letter} (${d.title || "sem título"}): ${d.exercises.join("; ")}`);
  }
  if (ctx.today) {
    lines.push(
      `Current workout: ${ctx.today.letter}. Targets: ${ctx.today.exercises.map((e) => `${e.name}${e.target ? ` [${e.target}]` : ""}`).join("; ")}`,
    );
  }
  if (ctx.lastSets.length) {
    lines.push(`Last logged sets (oldest → newest): ${ctx.lastSets.map((s) => `${s.exercise} ${s.weight}kg×${s.reps}`).join("; ")}`);
  }

  return [
    { role: "developer" as const, content: `Context:\n${lines.join("\n") || "(empty)"}` },
    { role: "user" as const, content: text },
  ];
}
