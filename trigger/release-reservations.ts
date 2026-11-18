import { schedules } from "@trigger.dev/sdk";
import { releaseStaleReservations } from "@/lib/limits";
import { log } from "./log";

/**
 * Recovery sweep for AI budget holds whose release failed (or whose process died), see releaseAiBudget. It has its own
 * schedule and retry policy so it never depends on the tick's session-close and reminder work, and a failed sweep is
 * retried on its own. The sweep is idempotent and safe to run concurrently.
 */
export const releaseReservations = schedules.task({
  id: "release-reservations",
  cron: "*/15 * * * *",
  machine: "micro",
  maxDuration: 120,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000, randomize: true },
  run: async () => {
    const released = await releaseStaleReservations();
    if (released) log.info("AI reservations released", { ai_reservations_released: released });
    return { released };
  },
});
