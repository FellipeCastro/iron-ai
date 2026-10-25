"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useRef, useState } from "react";
import { buttonSecondary } from "./ui";

/** Opens the Sentry feedback form (configured in instrumentation-client.ts). Disabled when Sentry is off. */
export function FeedbackButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Read on the client only: the integration does not exist during server rendering.
    const feedback = Sentry.getFeedback();
    if (!feedback || !ref.current) return;
    const unsubscribe = feedback.attachTo(ref.current, { tags: { page: "settings" } });
    setReady(true);
    return unsubscribe;
  }, []);

  return (
    <button ref={ref} type="button" disabled={!ready} className={buttonSecondary}>
      Enviar feedback
    </button>
  );
}
