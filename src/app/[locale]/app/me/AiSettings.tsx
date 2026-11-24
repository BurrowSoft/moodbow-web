"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AiConsentSheet } from "@/components/AiConsentSheet";
import { FOCUS_AREAS, FOCUS_KEYS, TONE_KEYS, TONES, type FocusArea, type Tone } from "@/lib/journal/ai";
import { POLICY_VERSIONS } from "@/lib/legalVersions";
import { recordAiWithdrawal, saveFocusAreas, saveTone, setAiEnabled, type AiSaveResult, type AiSwitchResult } from "./actions";
import { useUntilLoaded } from "@/lib/ui/untilLoaded";
import { wholeNames } from "@/lib/wholeNames";
import { SWITCH_CONTROL, SWITCH_LABEL, SWITCH_ROW } from "@/lib/ui/switchRow";

type Values = { on: boolean; tone: Tone; focus: FocusArea[] };
type Field = keyof Values;

// Me → AI (M9, the first section of Me when AI is shown): AI on/off with the
// consent text, tone, focus areas and the credit balance. Each control saves
// as soon as it changes; a failed save puts it back to what the account has,
// with the error and Try again (decision 111). Tone and focus only while AI
// is on, as in Set up.
// The AI consent is asked here only (UX, 23 Nov, the AI go-live, as the app): turning AI on without a
// current consent (the version this build asks for) opens the consent sheet first, with the consent text
// word for word. Only its "Turn on AI" records the consent; "Not now", Escape or a tap outside records
// nothing and leaves AI off. With a current consent (an Off whose withdrawal didn't go through) there's
// no sheet. Without scripts the switch does nothing (no form), so nothing is recorded that way either.
export function AiSettings({ initial, consented, credits }: { initial: Values; consented: boolean; credits: { balance: number } }) {
  const untilLoaded = useUntilLoaded();
  const t = useTranslations("ai");
  const ta = useTranslations("app");
  const tt = useTranslations("today");
  const [values, setValues] = useState(initial);
  // What the account has (the last successful save of each field).
  const saved = useRef(initial);
  // Whether the account's AI consent is current: set by a successful On (from the sheet), cleared by a
  // recorded withdrawal.
  const current = useRef(consented);
  const [asking, setAsking] = useState(false);
  // The failed save, for Try again: the field and value tried, or (AI
  // switched off but its withdrawal not yet recorded) just the withdrawal.
  // confirmed: the failed save came from the sheet's Turn on AI, so Try again carries its confirm too.
  const [failed, setFailed] = useState<{ field: Field; tried: Values[Field]; withdrawal?: boolean; confirmed?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  // confirmed: the sheet's "Turn on AI", the only call that records the consent (at this build's version;
  // the action checks it again).
  const send = (field: Field, next: Values[Field], withdrawalOnly = false, confirmed = false): Promise<AiSaveResult | AiSwitchResult> => {
    if (withdrawalOnly) return recordAiWithdrawal();
    if (field === "on") return confirmed ? setAiEnabled(next as boolean, { version: POLICY_VERSIONS.ai }) : setAiEnabled(next as boolean);
    return field === "tone" ? saveTone(next as Tone) : saveFocusAreas(next as FocusArea[]);
  };

  // While a save is in flight, input is ignored (not disabled: disabling
  // the focused radio or switch would drop keyboard focus; a11y pass).
  const save = <F extends Field>(field: F, next: Values[F], withdrawalOnly = false, confirmed = false) => {
    if (pending) return;
    setFailed(null);
    setValues((v) => ({ ...v, [field]: next }));
    startTransition(async () => {
      let result: AiSaveResult | AiSwitchResult;
      try {
        result = await send(field, next, withdrawalOnly, confirmed);
      } catch (e) {
        if (typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")) throw e;
        result = { ok: false };
      }
      if (result.ok) {
        saved.current = { ...saved.current, [field]: next };
        if (field === "on") current.current = next === true;
        return;
      }
      // The switch takes what the server says it has (two steps: one may
      // have gone through); everything else goes back to the last save.
      if (field === "on" && "aiEnabled" in result) saved.current = { ...saved.current, on: result.aiEnabled };
      setValues((v) => ({ ...v, [field]: saved.current[field] }));
      setFailed({ field, tried: next, withdrawal: withdrawalOnly || ("pending" in result && result.pending === "withdrawal"), confirmed });
    });
  };

  // The switch: On without a current consent asks first; everything else saves at once.
  const toggle = (on: boolean) => {
    if (pending) return;
    if (on && !current.current) return setAsking(true);
    save("on", on);
  };
  // Stable, so the open sheet's focus handling isn't set up again on a re-render.
  const notNow = useCallback(() => setAsking(false), []);
  const turnOn = () => {
    setAsking(false);
    save("on", true, false, true);
  };

  const chip = (active: boolean) =>
    `inline-flex min-h-12 items-center rounded-full border px-[16px] text-sm font-medium aria-disabled:opacity-60 ${active ? "border-accent bg-pill text-accent" : "border-border text-muted hover:bg-pill"}`;

  return (
    <section {...untilLoaded} aria-labelledby="me-ai" className="rounded-3xl border border-border bg-surface p-[24px]">
      <h2 id="me-ai" className="text-lg font-medium text-text">
        {t("meAi")}
      </h2>
      <label className={`mt-4 ${SWITCH_ROW} min-h-11 text-text`}>
        <span className={SWITCH_LABEL}>{t("meAiOn")}</span>
        <input
          type="checkbox"
          role="switch"
          data-testid="me-ai-on"
          checked={values.on}
          aria-disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className={`${SWITCH_CONTROL} h-6 w-6 accent-[var(--color-accent)] aria-disabled:opacity-60`}
        />
      </label>
      <p className="mt-2 text-sm text-muted" data-testid="me-ai-consent">
        {wholeNames(t("consentAiBody"))}
      </p>
      {/* The same sheet as Insights → AI's invitation (decision 258). */}
      {asking && <AiConsentSheet testId="me-ai-sheet" onNotNow={notNow} onTurnOn={turnOn} />}

      {!values.on ? (
        <p className="mt-4 text-sm text-muted" data-testid="me-ai-off">
          {t("meAiOffHint")}
        </p>
      ) : (
        <>
          <fieldset className="mt-6">
            <legend className="text-sm font-medium text-text">{t("meTone")}</legend>
            <div className="mt-2 space-y-2">
              {TONES.map((tone) => (
                <label key={tone} className="flex min-h-11 items-center gap-3 text-text">
                  <input
                    type="radio"
                    name="me-ai-tone"
                    data-testid={`me-ai-tone-${tone}`}
                    aria-describedby={`me-ai-tone-${tone}-hint`}
                    checked={values.tone === tone}
                    aria-disabled={pending}
                    onChange={() => save("tone", tone)}
                    className="h-5 w-5 accent-[var(--color-accent)] aria-disabled:opacity-60"
                  />
                  <span className="flex flex-col">
                    <span>{t(TONE_KEYS[tone][0])}</span>
                    <span id={`me-ai-tone-${tone}-hint`} aria-hidden="true" className="text-sm text-muted">{t(TONE_KEYS[tone][1])}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-6">
            <legend className="text-sm font-medium text-text">{t("meFocus")}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {FOCUS_AREAS.map((area) => {
                const on = values.focus.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    aria-pressed={on}
                    data-testid={`me-ai-focus-${area}`}
                    aria-disabled={pending}
                    onClick={() => save("focus", on ? values.focus.filter((a) => a !== area) : FOCUS_AREAS.filter((a) => a === area || values.focus.includes(a)))}
                    className={chip(on)}
                  >
                    {t(FOCUS_KEYS[area] as "focusSleep")}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </>
      )}

      {/* No credits product any more (14 Nov): no balance shown. The steady Lite state stays, as
          the server's switch does (creditsOut is only the one-time notice; decision 122). */}
      {credits.balance <= 0 && (
        <p className="mt-6 border-t border-border pt-4 text-sm text-muted" data-testid="me-ai-lite">
          {t("creditsLiteNow")}
        </p>
      )}

      {failed && !pending && (
        <div className="mt-4">
          <p role="alert" data-testid="me-ai-error" className="text-sm font-medium text-accent">
            {tt("errGeneric")}
          </p>
          <button type="button" data-testid="me-ai-retry" onClick={() => save(failed.field, failed.tried, failed.withdrawal, failed.confirmed)} className="mt-2 min-h-11 rounded-full border border-border px-[16px] text-sm font-medium text-text">
            {ta("tryAgain")}
          </button>
        </div>
      )}
    </section>
  );
}
