"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteAccountAction, saveSettingsAction } from "@/app/(app)/actions";
import type { Settings } from "@/lib/data/types";
import { WEEKDAYS } from "@/lib/format";
import { PRIVACY_URL, TERMS_URL } from "@/lib/routes";
import { BillingCard } from "./billing-card";
import { FeedbackButton } from "./feedback-button";
import { TelegramCard } from "./telegram-card";
import { useToast } from "./toast";
import { Card, CardTitle, buttonDanger, buttonPrimary, buttonSecondary, inputBase } from "./ui";

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT−3)" },
  { value: "America/Manaus", label: "Manaus (GMT−4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT−5)" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT−2)" },
  { value: "Europe/Lisbon", label: "Lisboa" },
];

const INCREMENTS = [1, 2, 2.5, 5];
const CONFIRM_WORD = "EXCLUIR";

export function SettingsForm({ initial, linkedSince, checkout }: { initial: Settings; linkedSince: string | null; checkout?: string }) {
  const [prefs, setPrefs] = useState({
    timezone: initial.timezone,
    reminderTime: initial.reminderTime,
    trainingDays: initial.trainingDays,
    weightIncrementKg: initial.weightIncrementKg,
  });
  const [savedPrefs, setSavedPrefs] = useState(prefs);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [toast, showToast] = useToast();
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = JSON.stringify(prefs) !== JSON.stringify(savedPrefs);

  function toggleDay(iso: number) {
    setPrefs((p) => ({
      ...p,
      trainingDays: p.trainingDays.includes(iso) ? p.trainingDays.filter((d) => d !== iso) : [...p.trainingDays, iso].sort((a, b) => a - b),
    }));
  }

  function savePrefs() {
    startTransition(async () => {
      const result = await saveSettingsAction(prefs);
      if (!result.ok) return showToast(result.error);
      setSavedPrefs(prefs);
      showToast("Preferências salvas");
    });
  }

  function deleteAccount() {
    startTransition(async () => {
      const result = await deleteAccountAction();
      if (!result.ok) return showToast(result.error);
      router.replace("/");
    });
  }

  return (
    <div className="mt-10 grid gap-6">
            {/* Preferences */}
      <Card>
        <CardTitle title="Dias e horário de treino" subtitle="Avisamos no Telegram na hora do seu treino, nos dias escolhidos." />

        <div className="mt-6 grid gap-8">
          <fieldset>
            <legend className="text-[15px] font-semibold">Dias de treino</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = prefs.trainingDays.includes(d.iso);
                return (
                  <button
                    key={d.iso}
                    type="button"
                    aria-pressed={on}
                    aria-label={d.long}
                    onClick={() => toggleDay(d.iso)}
                    className={`h-11 w-14 rounded-full text-[15px] font-semibold transition-colors ${
                      on ? "bg-black text-white" : "border border-[#e5e7eb] bg-white text-[#3f3f46] hover:bg-[#f3f4f6]"
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[13px] text-[#8a8a94]">{prefs.trainingDays.length} dias por semana</p>
          </fieldset>

          <div className="grid gap-6 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-[15px] font-semibold">Horário do treino</span>
              <input
                type="time"
                value={prefs.reminderTime}
                onChange={(e) => setPrefs({ ...prefs, reminderTime: e.target.value })}
                className={inputBase}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-[15px] font-semibold">Fuso horário</span>
              <select value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })} className={inputBase}>
                {(TIMEZONES.some((tz) => tz.value === initial.timezone)
                  ? TIMEZONES
                  : [...TIMEZONES, { value: initial.timezone, label: initial.timezone }]
                ).map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="text-[15px] font-semibold">Incremento de carga</legend>
            <p className="mt-1 text-[13px] text-[#8a8a94]">Quanto a carga sobe quando você chega a 12 repetições.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {INCREMENTS.map((kg) => (
                <button
                  key={kg}
                  type="button"
                  aria-pressed={prefs.weightIncrementKg === kg}
                  onClick={() => setPrefs({ ...prefs, weightIncrementKg: kg })}
                  className={`h-11 rounded-full px-5 text-[15px] font-semibold transition-colors ${
                    prefs.weightIncrementKg === kg ? "bg-black text-white" : "border border-[#e5e7eb] bg-white text-[#3f3f46] hover:bg-[#f3f4f6]"
                  }`}
                >
                  +{String(kg).replace(".", ",")} kg
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 border-t border-[#f1f1f4] pt-6">
          <button type="button" disabled={!dirty || pending || prefs.trainingDays.length === 0} onClick={savePrefs} className={buttonPrimary}>
            Salvar alterações
          </button>
          {dirty && (
            <button type="button" onClick={() => setPrefs(savedPrefs)} className={buttonSecondary}>
              Descartar
            </button>
          )}
        </div>
      </Card>

      <BillingCard billing={initial.billing} timezone={initial.timezone} checkout={checkout} />

      <TelegramCard telegram={initial.telegram} linkedSince={linkedSince} usage={initial.usage} />

      <Card>
        <CardTitle title="Feedback" subtitle="Encontrou um problema ou tem uma ideia? Conte pra gente, cada mensagem é lida." />
        <div className="mt-6">
          <FeedbackButton />
        </div>
      </Card>

      <Card>
        <CardTitle title="Privacidade e termos" subtitle="Como tratamos seus dados e as regras de uso do Iron AI." />
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={PRIVACY_URL} className={buttonSecondary}>
            Política de privacidade
          </Link>
          <Link href={TERMS_URL} className={buttonSecondary}>
            Termos de serviço
          </Link>
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="border border-[#fecdd3]">
        <CardTitle title="Excluir conta" subtitle="Apaga de forma definitiva sua rotina, histórico, metas e o vínculo com o Telegram." />
        {confirmDelete ? (
          <div className="mt-6 grid gap-3 sm:max-w-[420px]">
            <label className="grid gap-2">
              <span className="text-[14px] text-[#3f3f46]">
                Digite <span className="font-semibold text-[#111]">{CONFIRM_WORD}</span> para confirmar
              </span>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={inputBase} autoFocus />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={pending || confirmText.trim().toUpperCase() !== CONFIRM_WORD}
                onClick={deleteAccount}
                className={buttonDanger}
              >
                Excluir definitivamente
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  setConfirmText("");
                }}
                className={buttonSecondary}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className={`${buttonSecondary} mt-6 border-[#fecdd3]! text-[#be123c]`}>
            Excluir minha conta
          </button>
        )}
      </Card>
      {toast}
    </div>
  );
}
