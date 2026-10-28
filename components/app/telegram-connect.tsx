"use client";

import { useState, useTransition } from "react";
import { createTelegramLinkAction } from "@/app/(app)/actions";
import { ArrowRightIcon, TelegramColorIcon } from "@/components/landing/icons";
import { TelegramCard } from "./telegram-card";
import { useToast } from "./toast";

/** Dashboard entry point while Telegram is not linked: the pill opens the same card as Settings, right below it. */
export function TelegramConnect() {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const [pending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      const result = await createTelegramLinkAction();
      if (result.ok) setDeepLink(result.data.url);
      else showToast(result.error);
    });
  }

  return (
    <>
      {!deepLink && (
        <button
          type="button"
          onClick={open}
          disabled={pending}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[14px] font-medium shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-opacity hover:opacity-80 disabled:opacity-60"
        >
          <TelegramColorIcon className="size-5" />
          Conectar Telegram
          <ArrowRightIcon className="size-4" />
        </button>
      )}
      {deepLink && (
        <div className="mt-5">
          <TelegramCard telegram={{ connected: false, username: null, linkedAt: null }} initialDeepLink={deepLink} />
        </div>
      )}
      {toast}
    </>
  );
}
