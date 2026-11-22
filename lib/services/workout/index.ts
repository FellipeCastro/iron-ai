// Workout log I/O. Rules live in lib/engine; this module loads the valid log, applies them and persists.
// The set log is append-only: a correction voids the old row and inserts a new one that supersedes it,
// keeping the original `created_at` (the moment the set was performed) so ordering stays stable.

export { loadLog, loadTargets, type LogRow } from "./log";

export {
  closeSession,
  findOpenSession,
  lastTrainedLetter,
  markSummarySent,
  nextRoutineDay,
  sessionMinutes,
  setSessionDuration,
  type ClosedSession,
  type CloseReason,
} from "./sessions";

export { logSets, updateAlreadyLogged, type SetInput } from "./logging";

export { correctSet, deleteSet, type SetSelector } from "./corrections";

export { addSetToSession, deleteExerciseFromSession, deleteSessionById, deleteSetById, editSetById } from "./site-edits";
