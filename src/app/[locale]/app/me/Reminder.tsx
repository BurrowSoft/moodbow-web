"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/Switch";
import { saveReminder, type ReminderState } from "./actions";

// Me → Daily reminder (M7): on/off and the time, saved as soon as either
// changes (update_settings). The notification itself only exists on the
// phone, which the web says plainly (webReminderNote).
// A failed save puts both controls back to what the account has, with the
// error and Try again (which resends what was tried): a control never shows
// a state the server doesn't have (decision 111, after the Web Tester's #19).
export function Reminder({ on: initialOn, time: initialTime }: { on: boolean; time: string }) {
  const t = useTranslations("me");
  const tt = useTranslations("today");
  const ta = useTranslations("app");
  const [on, setOn] = useState(initialOn);
  const [time, setTime] = useState(initialTime);
  // What the account has (the last successful save).
  const saved = useRef({ on: initialOn, time: initialTime });
  // The last time sent, so leaving the field unchanged sends nothing.
  const sentTime = useRef(initialTime);
  const [state, action, pending] = useActionState<ReminderState, FormData>(async (prev, form) => {
    let result: ReminderState;
    try {
      result = await saveReminder(prev, form);
    } catch (e) {
      if (typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")) throw e;
      result = { status: "error", on: form.get("reminder_on") === "true", time: String(form.get("reminder_time")) };
    }
    if (result.status === "saved") saved.current = { on: result.on, time: result.time };
    if (result.status === "error") {
      setOn(saved.current.on);
      setTime(saved.current.time);
      sentTime.current = saved.current.time;
    }
    return result;
  }, { status: "idle" });

  // Only a save the switch started makes the controls wait: a time saved on
  // leaving the field must not swallow the switch click that moved focus
  // (the click sends the time with it; reviewer #19).
  const [fromSwitch, setFromSwitch] = useState(false);
  const busy = pending && fromSwitch;
  const save = (nextOn: boolean, nextTime: string, bySwitch = false) => {
    setFromSwitch(bySwitch);
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
      {/* While a save runs, the switch and the time wait for it (the app,
          decision 206); a failure puts both back (decision 111). */}
      <Switch
        checked={on}
        busy={busy}
        onChange={(next) => {
          setOn(next);
          save(next, time, true);
        }}
        label={t("meReminder")}
        testId="me-reminder-on"
        className="mt-4"
      />
      <label htmlFor="me-reminder-time" className="mt-3 block text-sm font-medium text-text">
        {t("meReminderTime")}
      </label>
      <input
        id="me-reminder-time"
        type="time"
        data-testid="me-reminder-time"
        value={time}
        disabled={!on || busy}
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
      {!pending && state.status === "error" ? (
        <button
          type="button"
          data-testid="me-reminder-retry"
          onClick={() => {
            setOn(state.on);
            setTime(state.time);
            save(state.on, state.time);
          }}
          className="mt-2 min-h-11 rounded-full border border-border px-4 text-sm font-medium text-text"
        >
          {ta("tryAgain")}
        </button>
      ) : null}
    </section>
  );
}
