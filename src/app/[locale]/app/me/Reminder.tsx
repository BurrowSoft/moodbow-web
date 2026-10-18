"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { saveReminder, type ReminderState } from "./actions";

// Me → Daily reminder (M7): on/off and the time, saved as soon as either
// changes (update_settings). The notification itself only exists on the
// phone, which the web says plainly (webReminderNote).
export function Reminder({ on: initialOn, time: initialTime }: { on: boolean; time: string }) {
  const t = useTranslations("me");
  const tt = useTranslations("today");
  const [on, setOn] = useState(initialOn);
  const [time, setTime] = useState(initialTime);
  // The last time sent, so leaving the field unchanged sends nothing.
  const sentTime = useRef(initialTime);
  const [state, action, pending] = useActionState<ReminderState, FormData>(async (prev, form) => {
    try {
      return await saveReminder(prev, form);
    } catch (e) {
      if (typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")) throw e;
      return { status: "error", on: form.get("reminder_on") === "true", time: String(form.get("reminder_time")) };
    }
  }, { status: "idle" });

  const save = (nextOn: boolean, nextTime: string) => {
    sentTime.current = nextTime;
    const form = new FormData();
    form.set("reminder_on", String(nextOn));
    form.set("reminder_time", nextTime);
    startTransition(() => action(form));
  };

  return (
    <section aria-labelledby="me-reminder" className="rounded-3xl border border-border bg-surface p-6">
      <h2 id="me-reminder" className="text-lg font-medium text-text">
        {t("meReminder")}
      </h2>
      <label className="mt-4 flex min-h-11 items-center justify-between gap-4 text-text">
        <span>{t("meReminder")}</span>
        <input
          type="checkbox"
          role="switch"
          data-testid="me-reminder-on"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            save(e.target.checked, time);
          }}
          className="h-6 w-6 accent-[var(--color-accent)]"
        />
      </label>
      <label htmlFor="me-reminder-time" className="mt-3 block text-sm font-medium text-text">
        {t("meReminderTime")}
      </label>
      <input
        id="me-reminder-time"
        type="time"
        data-testid="me-reminder-time"
        value={time}
        disabled={!on}
        onChange={(e) => setTime(e.target.value)}
        onBlur={(e) => e.target.value && e.target.value !== sentTime.current && save(on, e.target.value)}
        className="mt-2 block rounded-2xl border border-border bg-bg px-4 py-3 text-text disabled:opacity-50"
      />
      <p className="mt-3 text-sm text-muted" data-testid="me-reminder-note">
        {t("webReminderNote")}
      </p>
      <p role="status" data-testid="me-reminder-status" className="mt-2 text-sm font-medium text-text">
        {!pending && state.status === "saved" ? tt("checkinSaved") : !pending && state.status === "error" ? tt("errGeneric") : null}
      </p>
    </section>
  );
}
