import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { SettingsForm } from "@/components/app/settings-form";
import { PageHeader } from "@/components/app/ui";
import { getSettings } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Configurações — Iron AI" };

export default async function SettingsPage() {
  await auth.protect();
  const settings = await getSettings();
  const linkedSince = settings.telegram.linkedAt
    ? formatDate(settings.telegram.linkedAt, settings.timezone, { day: "2-digit", month: "short", year: "numeric" })
    : null;

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Sua conta" description="Telegram, lembretes e preferências de progressão." />
      <div className="max-w-[860px]">
        <SettingsForm initial={settings} linkedSince={linkedSince} />
      </div>
    </>
  );
}
