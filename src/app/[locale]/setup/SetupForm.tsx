"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { primaryButtonClass } from "@/components/AuthField";
import { FOCUS_AREAS, FOCUS_KEYS, TONE_KEYS, TONES, type FocusArea } from "@/lib/journal/ai";
import { completeSetup, type SetupState } from "./actions";

// A focus area: a multi-select chip (UX: chips for multi-select), the same
// look as Me → AI.
const chip = (on: boolean) =>
  `inline-flex min-h-12 items-center rounded-full border px-4 text-sm font-medium ${on ? "border-accent bg-pill text-accent" : "border-border text-muted hover:bg-pill"}`;

// Set up (M3, r1 "Make it yours"), web version. askAi: AI was turned on at
// Consent (and AI is shown on the web): focus areas (chips) and tone (a
// radio list with hints) first, as on the app; otherwise only the reminder.
// All skippable; defaults: no focus areas, tone Warm, reminder on at 21:00.
export function SetupForm({ askAi }: { askAi: boolean }) {
  const t = useTranslations("onboarding");
  const tai = useTranslations("ai");
  const ta = useTranslations("auth");
  const [state, action, pending] = useActionState<SetupState, FormData>(completeSetup, { status: "idle" });
  const [off, setOff] = useState(false);
  const [focus, setFocus] = useState<FocusArea[]>([]);

  return (
    <form action={action} className="space-y-6">
      {askAi && (
        <>
          <fieldset className="rounded-2xl border border-border bg-surface px-5 pb-5 pt-1">
            <legend className="float-left w-full pt-4 text-lg font-medium text-text">{t("setupFocusTitle")}</legend>
            {/* The chosen areas, in FOCUS_AREAS order; focus_shown says the
                row was there, so none chosen saves as none. */}
            <input type="hidden" name="focus_shown" value="1" />
            {focus.map((area) => (
              <input key={area} type="hidden" name="focus" value={area} />
            ))}
            <div className="clear-left flex flex-wrap gap-2 pt-4">
              {FOCUS_AREAS.map((area) => {
                const on = focus.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    aria-pressed={on}
                    data-testid={`setup-focus-${area}`}
                    onClick={() => setFocus((now) => (on ? now.filter((a) => a !== area) : FOCUS_AREAS.filter((a) => a === area || now.includes(a))))}
                    className={chip(on)}
                  >
                    {tai(FOCUS_KEYS[area])}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="rounded-2xl border border-border bg-surface px-5 pb-5 pt-1">
            <legend className="float-left w-full pt-4 text-lg font-medium text-text">{t("setupToneTitle")}</legend>
            <div className="clear-left space-y-2 pt-4">
              {TONES.map((tone) => (
                <label key={tone} className="flex min-h-11 items-center gap-3 text-text">
                  <input
                    type="radio"
                    name="tone"
                    value={tone}
                    defaultChecked={tone === "warm"}
                    data-testid={`setup-tone-${tone}`}
                    aria-describedby={`setup-tone-${tone}-hint`}
                    className="h-5 w-5 accent-[var(--color-accent)]"
                  />
                  <span className="flex flex-col">
                    <span>{tai(TONE_KEYS[tone][0])}</span>
                    <span id={`setup-tone-${tone}-hint`} aria-hidden="true" className="text-sm text-muted">{tai(TONE_KEYS[tone][1])}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
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
