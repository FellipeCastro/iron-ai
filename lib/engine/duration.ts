// Workout duration typed by the user when they correct the one the bot guessed.

export const MAX_DURATION_MIN = 600;

/** "50", "50 min", "1h", "1h10", "1:10", "1h 10min" → minutes (1 to 600), or null. */
export function parseDurationInput(text: string) {
  const s = text.trim().toLowerCase().replace(/\s+/g, "");
  const clock = s.match(/^(\d{1,2})(?:h|:)(\d{1,2})?(?:min|m)?$/);
  const minutes = clock ? Number(clock[1]) * 60 + Number(clock[2] ?? 0) : (s.match(/^(\d{1,3})(?:min|m)?$/)?.[1] ?? null);
  const total = minutes === null ? null : Number(minutes);
  return total !== null && total >= 1 && total <= MAX_DURATION_MIN ? total : null;
}
