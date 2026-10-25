export const STAGNATION_WINDOW = 3;
export const STAGNATION_MIN_SESSIONS = 4;

/**
 * An exercise is stagnant when it has at least 4 sessions and none of the last 3 set a record.
 * `sessions` is newest first; each entry says whether that session had any record for the exercise.
 */
export function isStagnant(sessions: { hasRecord: boolean }[]) {
  if (sessions.length < STAGNATION_MIN_SESSIONS) return false;
  return sessions.slice(0, STAGNATION_WINDOW).every((s) => !s.hasRecord);
}
