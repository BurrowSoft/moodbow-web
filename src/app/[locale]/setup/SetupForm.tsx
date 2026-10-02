"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { primaryButtonClass } from "@/components/AuthField";
import { completeSetup, type SetupState } from "./actions";

// Set up (M3), web version: the reminder row only while AI is off (focus and
// tone rows are hidden, as on the app). Defaults: reminder on at 21:00.
export function SetupForm() {
  const t = useTranslations("onboarding");
  const ta = useTranslations("auth");
  const [state, action, pending] = useActionState<SetupState, FormData>(completeSetup, { status: "idle" });
  const [off, setOff] = useState(false);

  return (
    <form action={action} className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface px-5 py-5">
        <h2 className="text-lg font-medium text-text">{t("setupReminderTitle")}</h2>
        <p className="mt-1 text-sm">{t("setupReminderBody")}</p>
        <label htmlFor="reminder_time" className="mt-4 block text-sm font-medium text-text">
          {t("setupReminderTime")}
        </label>
        <input
          id="reminder_time"
          name="reminder_time"
          type="time"
          defaultValue="21:00"
          disabled={off}
          data-testid="setup-reminder-time"
          className="mt-2 block rounded-2xl border border-border bg-bg px-4 py-3 text-base text-text disabled:opacity-50"
        />
        <label className="mt-4 flex items-center gap-3 text-text">
          <input
            type="checkbox"
            name="reminder_off"
            data-testid="setup-reminder-off"
            checked={off}
            onChange={(e) => setOff(e.target.checked)}
            className="h-5 w-5 accent-[var(--accent)]"
          />
          <span>{t("setupReminderOff")}</span>
        </label>
      </section>
      {state.status === "error" && (
        <p role="alert" data-testid="setup-error" className="font-medium text-accent">
          {ta("errGeneric")}
        </p>
      )}
      <button type="submit" disabled={pending} data-testid="setup-done" className={primaryButtonClass}>
        {t("setupDone")}
      </button>
    </form>
  );
}
