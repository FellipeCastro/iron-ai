/** Postgres error 23505 (unique violation); Drizzle wraps the driver error, so look through `cause`. */
export function isUniqueViolation(err: unknown) {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
