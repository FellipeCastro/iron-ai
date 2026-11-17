import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, sessions, setEntries } from "@/db";
import { deleteExerciseFromSession, deleteSessionById, deleteSetById, editSetById, markSummarySent, setSessionDuration } from "@/lib/services/workout";
import { createExercise, createSession, createSet, createSubscribedUser } from "./helpers/factories";

// N-7: toda escrita em `sessions`/`set_entries` carrega o dono, não só a checagem que vem antes dela.
// Com o RLS ativo isso vira redundância; sem ele, é a única barreira se um chamador passar um ID alheio.
async function seed() {
  const { user: owner } = await createSubscribedUser("active");
  const { user: intruder } = await createSubscribedUser("active");
  const exercise = await createExercise();
  const session = await createSession(owner.id);
  const set = await createSet(session.id, exercise.id);
  return { owner, intruder, exercise, session, set };
}

const sessionRow = async (id: string) => (await db.select().from(sessions).where(eq(sessions.id, id)))[0];
const setRow = async (id: string) => (await db.select().from(setEntries).where(eq(setEntries.id, id)))[0];

describe("escritas de sessão ficam presas ao dono", () => {
  it("markSummarySent marca só a sessão do próprio usuário", async () => {
    const { owner, intruder, session } = await seed();

    await markSummarySent(intruder.id, session.id);
    expect((await sessionRow(session.id)).summarySentAt).toBeNull();

    await markSummarySent(owner.id, session.id);
    expect((await sessionRow(session.id)).summarySentAt).toBeInstanceOf(Date);
  });

  it("setSessionDuration por outro usuário não altera a duração", async () => {
    const { owner, intruder, session } = await seed();
    const before = (await sessionRow(session.id)).endedAt;

    expect(await setSessionDuration(intruder.id, session.id, 10)).toBe(false);
    expect((await sessionRow(session.id)).endedAt).toEqual(before);

    expect(await setSessionDuration(owner.id, session.id, 10)).toBe(true);
    expect((await sessionRow(session.id)).endedAt).not.toEqual(before);
  });

  it("editSetById e deleteSetById por outro usuário não tocam na série", async () => {
    const { intruder, set } = await seed();

    expect(await editSetById(intruder, set.id, { weight: 1, reps: 1 })).toBeNull();
    expect(await deleteSetById(intruder, set.id)).toBeNull();

    const row = await setRow(set.id);
    expect(row.voidedAt).toBeNull();
    expect(row.weight).toBe(set.weight);
  });

  it("deleteExerciseFromSession por outro usuário não anula séries nem apaga a sessão", async () => {
    const { intruder, exercise, session, set } = await seed();

    await deleteExerciseFromSession(intruder, session.id, exercise.id);

    expect((await setRow(set.id)).voidedAt).toBeNull();
    expect(await sessionRow(session.id)).toBeDefined();
  });

  it("deleteSessionById por outro usuário não apaga a sessão", async () => {
    const { owner, intruder, session } = await seed();

    expect(await deleteSessionById(intruder, session.id)).toBe(false);
    expect(await sessionRow(session.id)).toBeDefined();

    expect(await deleteSessionById(owner, session.id)).toBe(true);
    expect(await sessionRow(session.id)).toBeUndefined();
  });
});
