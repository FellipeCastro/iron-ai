import type { PrKind } from "@/lib/engine/records";
import type { ReportKind } from "@/lib/engine/periods";
import type { PeriodReport, exerciseReport, muscleGroupReport, sessionSummary } from "@/lib/engine/reports";
import { siteUrl } from "@/lib/env";
import { MUSCLE_LABEL, formatKcal, formatNumber } from "@/lib/format";
import { DASHBOARD_URL, ROUTINE_URL, SETTINGS_URL, exerciseUrl, sessionUrl } from "@/lib/routes";
import type { MuscleGroup } from "@/db/schema";

// Every bot reply is a template here (HTML parse mode). The LLM never writes user-facing text.

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const kg = (n: number) => `${formatNumber(n)} kg`;
// Standard set format everywhere: "10 reps × 20 kg" (bodyweight sets drop the weight).
const load = (weight: number, reps: number) => `${reps} reps${weight > 0 ? ` × ${kg(weight)}` : ""}`;
// One set per line, indented under its exercise.
const setLine = (weight: number, reps: number) => `  ${load(weight, reps)}`;
const exerciseBlock = (name: string, setLines: string[]) => [`• <b>${esc(name)}</b>:`, ...setLines];
const link = (path: string, label: string) => `<a href="${siteUrl()}${path}">${label}</a>`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ordinal = (position: number) => `${position}ª série`;
const groupLabel =(g: string) => MUSCLE_LABEL[g as MuscleGroup] ?? g;
const RECORD_LABEL: Record<PrKind, string> = { weight: "🏆 recorde de carga", reps: "🏆 recorde de reps" };

// ---------- Linking & onboarding ----------

export const notLinked = () =>
  `Olá! Eu sou o <b>Iron AI</b> 💪\n\nPara começar, crie sua conta e toque em <b>Conectar Telegram</b> em ${link(SETTINGS_URL, "Configurações")}. O link abre esta conversa já vinculada.`;

export const subscriptionRequired = () =>
  `Para continuar usando o <b>Iron AI</b>, ative sua assinatura em ${link(SETTINGS_URL, "Configurações")}. Os planos começam em R$ 14,90 por mês e você pode cancelar quando quiser. 💪`;

export const linkInvalid =() => `Esse link de conexão expirou ou já foi usado. Gere um novo em ${link(SETTINGS_URL, "Configurações")}.`;

export const linkChatTaken = () => "Este Telegram já está conectado a outra conta do Iron AI. Desconecte por lá antes de vincular aqui.";

export const linked = (hasRoutine: boolean) => `Pronto, Telegram conectado! ✅\n\n${hasRoutine ? howToLog() : onboardingPrompt()}`;

export const onboardingPrompt = () =>
  [
    "Vamos montar seus treinos. Me mande seus treinos em uma mensagem, por exemplo:",
    "",
    "<i>A: supino reto 3 séries, crucifixo 3, tríceps corda 3\nB: puxada 3, remada baixa 3, rosca direta 3\nC: agachamento 4, leg press 3, elevação lateral 3</i>",
    "",
    `Se preferir, monte pelo site em ${link(ROUTINE_URL, "Treinos")}.`,
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
    "A meta de cada série sobe sozinha: bateu, +1 rep; chegou a 12, a carga sobe e volta para 6.",
    `Painel completo: ${link(DASHBOARD_URL, "iron.ai")}`,
  ].join("\n");

export type DraftDay = { title: string; exercises: { name: string; sets: number; id: string | null }[] };

export function routineDraft(days: DraftDay[]) {
  const lines = ["<b>Confere seus treinos?</b>", ""];
  days.forEach((d, i) => {
    lines.push(`<b>${String.fromCharCode(65 + i)} · ${esc(d.title)}</b>`);
    for (const e of d.exercises) lines.push(`• ${esc(e.name)} — ${plural(e.sets, "série", "séries")}${e.id ? "" : " <i>(novo)</i>"}`);
    lines.push("");
  });
  lines.push("Os treinos seguem esse rodízio, independente do dia da semana.");
  return lines.join("\n");
}

export const routineSaved = (firstTitle: string) => `Treinos salvos! ✅ Seu próximo treino é o <b>A · ${esc(firstTitle)}</b>.`;

const WEEKDAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const formatClock = (time: string) => time.slice(0, 5).replace(":", "h").replace(/h00$/, "h");

export const askDays = (empty = false) =>
  empty
    ? "Não entendi os dias. Me mande assim: <i>segunda, quarta e sexta</i> ou <i>segunda a sexta</i>."
    : "Quais dias da semana você treina? Ex.: <i>segunda, quarta e sexta</i> ou <i>segunda a sexta</i>.";

export const askTime = (retry = false) =>
  retry
    ? "Não entendi o horário. Me mande assim: <i>18:30</i> ou <i>7h</i>."
    : "Que horas você costuma treinar? Ex.: <i>18:30</i> ou <i>7h</i>.";

export const onboardingDone = (days: number[], time: string | null) =>
  [
    "Tudo pronto! ✅",
    `🗓️ Dias: ${days.map((d) => WEEKDAY_NAMES[d - 1]).join(", ")}`,
    time ? `⏰ Treino às ${formatClock(time)}` : "⏰ Sem horário definido (você pode definir em Configurações)",
    "",
    "Quando for treinar, é só me mandar o exercício, as repetições e o peso que eu registro para você. 💪",
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
  upNext: { kind: "same" | "next"; name: string; targets: ({ weight: number; reps: number } | null)[] } | null;
}) {
  const lines: string[] = [];
  if (input.opened) lines.push(`🏋️ Treino <b>${esc(input.opened.letter)} · ${esc(input.opened.title)}</b> iniciado`, "");
  for (const it of input.items) {
    const tag = it.isExtra ? " <i>(extra)</i>" : "";
    const rec = it.record ? ` ${RECORD_LABEL[it.record]}` : "";
    lines.push(`✅ <b>${esc(it.name)}</b> — ${ordinal(it.setPosition)}: ${load(it.weight, it.reps)}${tag}${rec}`);
  }
  if (input.upNext) {
    const { kind, name, targets } = input.upNext;
    lines.push("", kind === "same" ? "🎯 Faltam:" : "➡️ Próximo exercício:", `<b>${esc(name)}</b>:`);
    for (const t of targets) lines.push(t ? setLine(t.weight, t.reps) : "  livre");
  }
  return lines.join("\n");
}

/** Asked when a message has no exercise name, the exercise in progress is done and another one is next. */
export const askWhichExercise = (current: string, next: string) =>
  `Essa foi a primeira série de <b>${esc(next)}</b> ou uma série extra de <b>${esc(current)}</b>?`;

export function confirmLog(items: { name: string; weight: number | null; reps: number; sets: number }[]) {
  const lines = ["Entendi assim, confere?", ""];
  for (const it of items) {
    lines.push(`• <b>${esc(it.name)}</b> — ${it.sets > 1 ? `${it.sets} séries de ` : ""}${load(it.weight ?? 0, it.reps)}`);
  }
  return lines.join("\n");
}

export const confirmCorrection = (name: string | null, setNumber: number | null, to: { weight: number | null; reps: number | null }) => {
  const what = `${setNumber ? `a ${setNumber}ª série` : "a última série"}${name ? ` de <b>${esc(name)}</b>` : ""}`;
  const parts = [to.reps !== null ? `${to.reps} reps` : null, to.weight !== null ? kg(to.weight) : null].filter(Boolean);
  return `Corrigir ${what} para <b>${parts.join(" × ")}</b>?`;
};

export const confirmDelete = (name: string | null, setNumber: number | null) =>
  `Apagar ${setNumber ? `a ${setNumber}ª série` : "a última série"}${name ? ` de <b>${esc(name)}</b>` : ""}?`;

export const pickExercise = (query: string) => `Qual exercício é <b>“${esc(query)}”</b>?`;

export const unknownExercise = (query: string) =>
  `Não encontrei o exercício <b>“${esc(query)}”</b>. Tente o nome completo (ex.: <i>supino inclinado com halteres</i>) ou adicione-o em ${link(ROUTINE_URL, "Treinos")}.`;

export const cancelled = () => "Ok, não registrei nada.";
export const expiredAction = () => "Essa ação não está mais disponível.";

export const corrected = (it: { name: string; setPosition: number; from: { weight: number; reps: number }; to: { weight: number; reps: number } }) =>
  `✏️ <b>${esc(it.name)}</b> — ${ordinal(it.setPosition)} corrigida: ${load(it.from.weight, it.from.reps)} → <b>${load(it.to.weight, it.to.reps)}</b>`;

export const deleted = (it: { name: string; setPosition: number; weight: number; reps: number }) =>
  `🗑️ Removida: <b>${esc(it.name)}</b> — ${ordinal(it.setPosition)}: ${load(it.weight, it.reps)}`;

export const nothingToCorrect = () => "Não achei nenhuma série recente para alterar.";

// ---------- Session ----------

export const unknownDay = (query: string, days: { letter: string; title: string }[]) =>
  `Não achei o treino <b>“${esc(query)}”</b> nos seus treinos. Seus treinos: ${days.map((d) => `<b>${esc(d.letter)}</b>${d.title ? ` · ${esc(d.title)}` : ""}`).join(", ")}.`;

export const noOpenSession = () => "Você não tem treino em andamento. Mande sua primeira série para começar.";

const CLOSE_LABEL = { user: "Treino encerrado", complete: "Treino completo! 🎉", inactive: "Treino encerrado após 90 min sem séries" } as const;

export function summary(input: {
  sessionId: string;
  closeReason: keyof typeof CLOSE_LABEL;
  day: { letter: string; title: string } | null;
  data: ReturnType<typeof sessionSummary>;
  next: { letter: string; title: string } | null;
  /** Replaces the close-reason label, e.g. "Relatório do treino" when the user asks for the last workout. */
  label?: string;
}) {
  const { data } = input;
  const lines = [
    `<b>${input.label ?? CLOSE_LABEL[input.closeReason]}</b>${input.day ? ` · ${esc(input.day.letter)} ${esc(input.day.title)}` : ""}`,
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
    lines.push(...exerciseBlock(e.name, e.sets.map((s) => setLine(s.weight, s.reps))));
  }
  if (input.next) lines.push("", `Próximo: <b>${esc(input.next.letter)} · ${esc(input.next.title)}</b>`);
  lines.push("", `✏️ ${link(sessionUrl(input.sessionId), "Revisar e editar este treino no site")}`);
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
  const lines = [`${intro}${intro.endsWith("!") ? "" : ":"} <b>${esc(day.letter)} · ${esc(day.title)}</b>`, ""];
  for (const e of day.exercises) {
    const metas = Array.from({ length: e.plannedSets }, (_, i) => {
      const t = e.targets.find((x) => x.position === i + 1);
      return t ? setLine(t.weight, t.reps) : "  livre";
    });
    lines.push(...exerciseBlock(e.name, metas));
  }
  return lines.join("\n");
}

export const reminder = (day: PlanView | null) => nextWorkout(day, "⏰ Seu treino está chegando!");

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

const MAX_RECORD_LINES = 10;
const shortDate = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
/** "+12%" / "−8%" against the previous period; null when there is nothing to compare with. */
const percentChange = (now: number, before: number) => {
  if (before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`;
};

/** Automatic Monday report. `range` holds the local dates of the period (inclusive). */
export function periodReportText(kind: ReportKind, range: { from: string; to: string }, r: PeriodReport) {
  const prev = kind === "week" ? "semana anterior" : "mês anterior";
  const title =
    kind === "week"
      ? `Resumo da semana · ${shortDate(range.from)} a ${shortDate(range.to)}`
      : `Resumo de ${new Date(`${range.from}T00:00:00Z`).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" })}`;
  const volumeChange = percentChange(r.volume, r.previous.volume);

  const lines = [
    `<b>${title}</b>`,
    "",
    `🗓️ ${plural(r.sessions, "treino", "treinos")} · ${plural(r.sets, "série", "séries")}`,
    `📦 Volume total: <b>${kg(Math.round(r.volume))}</b>${volumeChange ? ` (${volumeChange} vs ${prev})` : ""}`,
  ];
  if (r.previous.sets === 0) lines.push(`<i>Sem treinos ${kind === "week" ? "na semana" : "no mês"} anterior para comparar.</i>`);

  lines.push("", "<b>Volume por grupo muscular</b>");
  for (const g of r.groups) {
    const change = percentChange(g.volume, g.previousVolume);
    const detail = g.sets ? `${kg(Math.round(g.volume))} · ${plural(g.sets, "série", "séries")}` : "sem treino";
    lines.push(`• <b>${groupLabel(g.group)}</b>: ${detail}${change ? ` (${change})` : ""}`);
  }

  lines.push("", `<b>Recordes batidos</b>${r.records.length ? ` (${r.records.length})` : ""}`);
  if (r.records.length === 0) lines.push("Nenhum desta vez. A constância constrói os próximos. 💪");
  for (const rec of r.records.slice(0, MAX_RECORD_LINES)) lines.push(`🏆 ${esc(rec.name)}: ${load(rec.weight, rec.reps)}`);
  if (r.records.length > MAX_RECORD_LINES) lines.push(`… e mais ${r.records.length - MAX_RECORD_LINES}`);
  if (r.previous.records > 0 || r.records.length > 0) {
    lines.push(`<i>${kind === "week" ? "Semana" : "Mês"} anterior: ${plural(r.previous.records, "recorde", "recordes")}.</i>`);
  }

  lines.push("", link(DASHBOARD_URL, "Abrir painel"));
  return lines.join("\n");
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

export const rateLimited = (limit?: number) =>
  `Você atingiu o limite ${limit ? `de ${limit} mensagens ` : ""}de hoje. Amanhã eu volto a registrar por aqui; até lá, o site continua funcionando.`;

export const monthlyLimited = (limit: number) =>
  `Você atingiu o limite de ${limit} mensagens deste mês. No próximo mês eu volto a registrar por aqui; até lá, o site continua funcionando.`;

export const unavailable = () =>
  "Estou com instabilidade agora e não consegui ler sua mensagem. Tente de novo em alguns minutos — nada foi registrado.";

export const nonText = () => "Por enquanto eu só entendo mensagens de texto e de áudio. ✍️🎙️";

export const audioTooLong = (maxSeconds: number) => `Esse áudio ficou longo demais. Mande áudios de até ${maxSeconds} segundos, uma série por vez.`;

export const audioUnclear = () => "Não consegui entender o áudio. Pode repetir ou mandar por texto? Ex.: <i>supino 10 reps 20kg</i>.";
