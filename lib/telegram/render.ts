import type { PrKind } from "@/lib/engine/records";
import type { exerciseReport, muscleGroupReport, sessionSummary } from "@/lib/engine/reports";
import { siteUrl } from "@/lib/env";
import { MUSCLE_LABEL, formatKcal, formatNumber } from "@/lib/format";
import { DASHBOARD_URL, HISTORY_URL, ROUTINE_URL, SETTINGS_URL, exerciseUrl } from "@/lib/routes";
import type { MuscleGroup } from "@/db/schema";

// Every bot reply is a template here (HTML parse mode). The LLM never writes user-facing text.

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const kg = (n: number) => `${formatNumber(n)} kg`;
const load = (weight: number, reps: number) => (weight > 0 ? `${kg(weight)} × ${reps}` : `${reps} reps`);
const link = (path: string, label: string) => `<a href="${siteUrl()}${path}">${label}</a>`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ordinal = (position: number) => `${position}ª série`;
const groupLabel =(g: string) => MUSCLE_LABEL[g as MuscleGroup] ?? g;
const RECORD_LABEL: Record<PrKind, string> = { weight: "🏆 recorde de carga", reps: "🏆 recorde de reps" };

// ---------- Linking & onboarding ----------

export const notLinked = () =>
  `Olá! Eu sou o <b>Iron AI</b> 💪\n\nPara começar, crie sua conta e toque em <b>Conectar Telegram</b> em ${link(SETTINGS_URL, "Configurações")}. O link abre esta conversa já vinculada.`;

export const linkInvalid = () => `Esse link de conexão expirou ou já foi usado. Gere um novo em ${link(SETTINGS_URL, "Configurações")}.`;

export const linkChatTaken = () => "Este Telegram já está conectado a outra conta do Iron AI. Desconecte por lá antes de vincular aqui.";

export const linked = (hasRoutine: boolean) => `Pronto, Telegram conectado! ✅\n\n${hasRoutine ? howToLog() : onboardingPrompt()}`;

export const onboardingPrompt = () =>
  [
    "Vamos montar sua rotina. Me mande seus treinos em uma mensagem, por exemplo:",
    "",
    "<i>A: supino reto 3 séries, crucifixo 3, tríceps corda 3\nB: puxada 3, remada baixa 3, rosca direta 3\nC: agachamento 4, leg press 3, elevação lateral 3</i>",
    "",
    `Se preferir, monte pelo site em ${link(ROUTINE_URL, "Rotina")}.`,
  ].join("\n");

const howToLog = () =>
  "É só me contar cada série como você falaria: <i>“supino 10 reps 20kg”</i>, <i>“remada 3x12 com 40”</i>. Para corrigir: <i>“errei, foi 25kg”</i>. Ao final: <i>“terminei”</i>.";

export const help = () =>
  [
    "<b>Como usar o Iron AI</b>",
    "",
    "• Registrar: <i>supino 10 reps 20kg</i> · <i>rosca 3x12 com 14</i>",
    "• Corrigir: <i>errei, foi 25kg</i> · <i>a 2ª do supino foi 9</i>",
    "• Apagar: <i>apaga a última</i>",
    "• Encerrar: <i>terminei</i> (ou depois de 90 min sem séries)",
    "• Consultar: <i>qual o treino de hoje?</i> · <i>como tá meu supino?</i> · <i>resumo da semana</i>",
    "",
    "A meta de cada série sobe sozinha: bateu, +1 rep; chegou a 12, a carga sobe e volta para 8.",
    `Painel completo: ${link(DASHBOARD_URL, "iron.ai")}`,
  ].join("\n");

export type DraftDay = { title: string; exercises: { name: string; sets: number; id: string | null }[] };

export function routineDraft(days: DraftDay[]) {
  const lines = ["<b>Confere sua rotina?</b>", ""];
  days.forEach((d, i) => {
    lines.push(`<b>${String.fromCharCode(65 + i)} · ${esc(d.title)}</b>`);
    for (const e of d.exercises) lines.push(`• ${esc(e.name)} — ${plural(e.sets, "série", "séries")}${e.id ? "" : " <i>(novo)</i>"}`);
    lines.push("");
  });
  lines.push("Os treinos seguem esse rodízio, independente do dia da semana.");
  return lines.join("\n");
}

export const routineSaved = (firstTitle: string) => `Rotina salva! ✅ Seu próximo treino é o <b>A · ${esc(firstTitle)}</b>.`;

const WEEKDAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const formatClock = (time: string) => time.slice(0, 5).replace(":", "h").replace(/h00$/, "h");

export const askDays = (empty = false) =>
  `${empty ? "Escolha pelo menos um dia. " : ""}Quais dias da semana você treina? Toque nos dias e depois em <b>Confirmar dias</b>.`;

export const askTime = (retry = false) =>
  retry
    ? "Não entendi o horário. Me mande assim: <i>18:30</i> ou <i>7h</i>."
    : "Que horas você costuma treinar? Eu te lembro nesse horário, nos dias escolhidos. Ex.: <i>18:30</i> ou <i>7h</i>.";

export const onboardingDone = (days: number[], time: string | null) =>
  [
    "Tudo pronto! ✅",
    `🗓️ Dias: ${days.map((d) => WEEKDAY_NAMES[d - 1]).join(", ")}`,
    time ? `⏰ Lembrete às ${formatClock(time)}` : "⏰ Sem lembrete (você pode ligar em Configurações)",
    "",
    howToLog(),
  ].join("\n");

// ---------- Logging ----------

export type LoggedItem = {
  name: string;
  setPosition: number;
  weight: number;
  reps: number;
  isExtra: boolean;
  record: PrKind | null;
  target: { weight: number; reps: number } | null;
};

export function setsLogged(input: {
  items: LoggedItem[];
  opened: { letter: string; title: string } | null;
  remaining: { name: string; missing: number }[];
}) {
  const lines: string[] = [];
  if (input.opened) lines.push(`🏋️ Treino <b>${esc(input.opened.letter)} · ${esc(input.opened.title)}</b> iniciado`, "");
  for (const it of input.items) {
    const tag = it.isExtra ? " <i>(extra)</i>" : "";
    const rec = it.record ? ` ${RECORD_LABEL[it.record]}` : "";
    lines.push(`✅ <b>${esc(it.name)}</b> — ${ordinal(it.setPosition)}: ${load(it.weight, it.reps)}${tag}${rec}`);
    if (it.target) lines.push(`    ↳ próxima meta da ${ordinal(it.setPosition)}: ${load(it.target.weight, it.target.reps)}`);
  }
  if (input.remaining.length) {
    const next = input.remaining.slice(0, 3).map((r) => `${esc(r.name)} (${plural(r.missing, "série", "séries")})`);
    lines.push("", `Faltam: ${next.join(", ")}${input.remaining.length > 3 ? "…" : ""}`);
  }
  return lines.join("\n");
}

export function confirmLog(items: { name: string; weight: number | null; reps: number; sets: number }[]) {
  const lines = ["Entendi assim, confere?", ""];
  for (const it of items) {
    lines.push(`• <b>${esc(it.name)}</b> — ${it.sets > 1 ? `${it.sets}× ` : ""}${it.weight === null ? `${it.reps} reps` : load(it.weight, it.reps)}`);
  }
  return lines.join("\n");
}

export const confirmCorrection = (name: string | null, setNumber: number | null, to: { weight: number | null; reps: number | null }) => {
  const what = `${setNumber ? `a ${setNumber}ª série` : "a última série"}${name ? ` de <b>${esc(name)}</b>` : ""}`;
  const parts = [to.weight !== null ? kg(to.weight) : null, to.reps !== null ? `${to.reps} reps` : null].filter(Boolean);
  return `Corrigir ${what} para <b>${parts.join(" × ")}</b>?`;
};

export const confirmDelete = (name: string | null, setNumber: number | null) =>
  `Apagar ${setNumber ? `a ${setNumber}ª série` : "a última série"}${name ? ` de <b>${esc(name)}</b>` : ""}?`;

export const pickExercise = (query: string) => `Qual exercício é <b>“${esc(query)}”</b>?`;

export const unknownExercise = (query: string) =>
  `Não encontrei o exercício <b>“${esc(query)}”</b>. Tente o nome completo (ex.: <i>supino inclinado com halteres</i>) ou adicione-o em ${link(ROUTINE_URL, "Rotina")}.`;

export const cancelled = () => "Ok, não registrei nada.";
export const expiredAction = () => "Essa ação não está mais disponível.";

export const corrected = (
  it: { name: string; setPosition: number; from: { weight: number; reps: number }; to: { weight: number; reps: number } },
  target: { weight: number; reps: number } | null,
) =>
  [
    `✏️ <b>${esc(it.name)}</b> — ${ordinal(it.setPosition)} corrigida: ${load(it.from.weight, it.from.reps)} → <b>${load(it.to.weight, it.to.reps)}</b>`,
    target ? `    ↳ próxima meta da ${ordinal(it.setPosition)}: ${load(target.weight, target.reps)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

export const deleted = (it: { name: string; setPosition: number; weight: number; reps: number }) =>
  `🗑️ Removida: <b>${esc(it.name)}</b> — ${ordinal(it.setPosition)}: ${load(it.weight, it.reps)}`;

export const nothingToCorrect = () => "Não achei nenhuma série recente para alterar.";

// ---------- Session ----------

export const noOpenSession = () => "Você não tem treino em andamento. Mande sua primeira série para começar.";

const CLOSE_LABEL = { user: "Treino encerrado", complete: "Treino completo! 🎉", inactive: "Treino encerrado após 90 min sem séries" } as const;

export function summary(input: {
  closeReason: keyof typeof CLOSE_LABEL;
  day: { letter: string; title: string } | null;
  data: ReturnType<typeof sessionSummary>;
  next: { letter: string; title: string } | null;
}) {
  const { data } = input;
  const lines = [
    `<b>${CLOSE_LABEL[input.closeReason]}</b>${input.day ? ` · ${esc(input.day.letter)} ${esc(input.day.title)}` : ""}`,
    "",
    `⏱️ ${data.durationMin} min · ${plural(data.setCount, "série", "séries")} · ${formatKcal(data.calories)} gastas (estimativa)`,
  ];
  if (data.records.length) {
    lines.push("", "<b>Recordes</b>");
    for (const r of data.records) lines.push(`🏆 ${esc(r.name)}: ${load(r.weight, r.reps)}`);
  }
  if (data.loadUps) lines.push("", `📈 ${plural(data.loadUps, "série subiu", "séries subiram")} de carga para o próximo treino.`);
  lines.push("", "<b>Exercícios</b>");
  for (const e of data.exercises) {
    lines.push(`• ${esc(e.name)}: ${e.sets.map((s) => load(s.weight, s.reps)).join(", ")}`);
  }
  if (input.next) lines.push("", `Próximo: <b>${esc(input.next.letter)} · ${esc(input.next.title)}</b>`);
  lines.push(link(HISTORY_URL, "Ver no histórico"));
  return lines.join("\n");
}

const formatMinutes = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}` : `${min} min`);

export const confirmDuration = (minutes: number) => `⏱️ Seu treino durou <b>${formatMinutes(minutes)}</b>. Está certo?`;
export const askDurationEdit = (retry = false) =>
  `${retry ? "Não entendi a duração. " : ""}Quanto tempo durou o treino? Ex.: <i>50</i>, <i>1h10</i>.`;
export const durationConfirmed = (minutes: number) => `Duração confirmada: <b>${formatMinutes(minutes)}</b> ✅`;
export const durationUpdated = (minutes: number) => `Duração atualizada para <b>${formatMinutes(minutes)}</b> ✅`;

export type PlanView = {
  letter: string;
  title: string;
  exercises: { name: string; plannedSets: number; targets: { position: number; weight: number; reps: number }[] }[];
};

export function nextWorkout(day: PlanView | null, intro = "Seu próximo treino") {
  if (!day) return onboardingPrompt();
  const lines = [`${intro}: <b>${esc(day.letter)} · ${esc(day.title)}</b>`, ""];
  for (const e of day.exercises) {
    const metas = Array.from({ length: e.plannedSets }, (_, i) => {
      const t = e.targets.find((x) => x.position === i + 1);
      return t ? load(t.weight, t.reps) : "livre";
    });
    lines.push(`• <b>${esc(e.name)}</b>: ${metas.join(" · ")}`);
  }
  return lines.join("\n");
}

export const reminder = (day: PlanView | null) => `⏰ Hora do treino!\n\n${nextWorkout(day, "Hoje é")}`;

// ---------- Reports ----------

export function exerciseReportText(id: string, r: NonNullable<ReturnType<typeof exerciseReport>>) {
  const change = r.weightChange30d;
  const lines = [
    `<b>${esc(r.name)}</b> · ${groupLabel(r.muscleGroup)}`,
    "",
    `Recorde: <b>${load(r.record.weight, r.record.reps)}</b>`,
    `Último treino: ${load(r.latest.weight, r.latest.reps)}`,
    `30 dias: ${change > 0 ? `+${kg(change)} 📈` : change < 0 ? `−${kg(-change)}` : "carga estável"}`,
    `1RM estimado: ${kg(r.bestE1rm)} · ${plural(r.sessionCount, "treino", "treinos")}`,
  ];
  if (r.stagnant) lines.push("", "⚠️ Sem recorde nos últimos 3 treinos. Vale revisar descanso, técnica ou trocar a variação.");
  lines.push("", "<b>Últimos treinos</b>");
  for (const s of r.recent) lines.push(`• ${s.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}: ${load(s.weight, s.reps)}`);
  lines.push("", link(exerciseUrl(id), "Ver gráfico"));
  return lines.join("\n");
}

export function muscleGroupReportText(rows: ReturnType<typeof muscleGroupReport>, days: number, only: string | null) {
  const list = only ? rows.filter((r) => r.group === only) : rows;
  if (list.length === 0) return only ? `Nenhuma série de ${groupLabel(only)} nos últimos ${days} dias.` : `Nenhuma série nos últimos ${days} dias.`;
  const lines = [`<b>Calorias por grupo · últimos ${days} dias</b>`, ""];
  for (const r of list) {
    const diff = r.previousCalories ? Math.round(((r.calories - r.previousCalories) / r.previousCalories) * 100) : null;
    lines.push(
      `• <b>${groupLabel(r.group)}</b>: ${plural(r.sets, "série", "séries")}, ${formatKcal(r.calories)}${diff === null ? "" : ` (${diff >= 0 ? "+" : ""}${diff}%)`}`,
    );
    if (only) lines.push(`   ${r.exercises.map(esc).join(", ")}`);
  }
  lines.push("", link(DASHBOARD_URL, "Abrir painel"));
  return lines.join("\n");
}

export function weekReport(input: { sessions: number; planned: number; sets: number; calories: number; records: number }) {
  return [
    "<b>Resumo dos últimos 7 dias</b>",
    "",
    input.planned ? `🗓️ ${input.sessions} de ${input.planned} treinos planejados` : `🗓️ ${plural(input.sessions, "treino", "treinos")}`,
    `💪 ${plural(input.sets, "série", "séries")} · ${formatKcal(input.calories)} gastas (estimativa)`,
    `🏆 ${plural(input.records, "recorde", "recordes")}`,
    "",
    link(DASHBOARD_URL, "Abrir painel"),
  ].join("\n");
}

export const noHistory = () => "Ainda não tenho séries suas registradas. Mande a primeira!";

// ---------- Clarifications & limits ----------

const CLARIFY = {
  missing_reps: "Quantas repetições? Ex.: <i>supino 10 reps 20kg</i>.",
  unknown_exercise: "Não reconheci o exercício. Pode mandar o nome completo?",
  ambiguous: "Não entendi direito. Pode reformular? Ex.: <i>supino 10 reps 20kg</i>.",
  greeting: "Oi! 💪 Bora treinar? Mande sua série quando fizer.",
  off_topic: "Por aqui eu só cuido dos seus treinos 🙂 Mande uma série ou pergunte pelo seu progresso.",
} as const;

export const clarify = (reason: keyof typeof CLARIFY | "help") => (reason === "help" ? help() : CLARIFY[reason]);

export const rateLimited = (limit: number) =>
  `Você atingiu o limite de ${limit} mensagens hoje. Amanhã eu volto a registrar por aqui; até lá, o site continua funcionando.`;

export const unavailable = () =>
  "Estou com instabilidade agora e não consegui ler sua mensagem. Tente de novo em alguns minutos — nada foi registrado.";

export const nonText = () => "Por enquanto eu só entendo mensagens de texto. ✍️";
