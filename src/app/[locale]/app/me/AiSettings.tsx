"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FOCUS_AREAS, TONES, type FocusArea, type Tone } from "@/lib/journal/ai";
import { recordAiWithdrawal, saveFocusAreas, saveTone, setAiEnabled, type AiSaveResult, type AiSwitchResult } from "./actions";

const TONE_KEYS = { warm: ["toneWarm", "toneWarmHint"], direct: ["toneDirect", "toneDirectHint"], brief: ["toneBrief", "toneBriefHint"] } as const;
const FOCUS_KEYS: Record<FocusArea, string> = {
  sleep: "focusSleep",
  stress: "focusStress",
  work: "focusWork",
  study: "focusStudy",
  relationships: "focusRelationships",
  family: "focusFamily",
  health: "focusHealth",
  self_esteem: "focusSelfEsteem",
};

type Values = { on: boolean; tone: Tone; focus: FocusArea[] };
type Field = keyof Values;

// Me → AI (M9, the first section of Me when AI is shown): AI on/off with the
// consent text, tone, focus areas and the credit balance. Each control saves
// as soon as it changes; a failed save puts it back to what the account has,
// with the error and Try again (decision 111). Tone and focus only while AI
// is on, as in Set up.
export function AiSettings({ initial, credits }: { initial: Values; credits: { balance: number } }) {
  const t = useTranslations("ai");
  const ta = useTranslations("app");
  const tt = useTranslations("today");
  const [values, setValues] = useState(initial);
  // What the account has (the last successful save of each field).
  const saved = useRef(initial);
  // The failed save, for Try again: the field and value tried, or (AI
  // switched off but its withdrawal not yet recorded) just the withdrawal.
  const [failed, setFailed] = useState<{ field: Field; tried: Values[Field]; withdrawal?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const send = (field: Field, next: Values[Field], withdrawalOnly = false): Promise<AiSaveResult | AiSwitchResult> => {
    if (withdrawalOnly) return recordAiWithdrawal();
    if (field === "on") return setAiEnabled(next as boolean);
    return field === "tone" ? saveTone(next as Tone) : saveFocusAreas(next as FocusArea[]);
  };

  // While a save is in flight, input is ignored (not disabled: disabling
  // the focused radio or switch would drop keyboard focus; a11y pass).
  const save = <F extends Field>(field: F, next: Values[F], withdrawalOnly = false) => {
    if (pending) return;
    setFailed(null);
    setValues((v) => ({ ...v, [field]: next }));
    startTransition(async () => {
      let result: AiSaveResult | AiSwitchResult;
      try {
        result = await send(field, next, withdrawalOnly);
      } catch (e) {
        if (typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")) throw e;
        result = { ok: false };
      }
      if (result.ok) {
        saved.current = { ...saved.current, [field]: next };
        return;
      }
      // The switch takes what the server says it has (two steps: one may
      // have gone through); everything else goes back to the last save.
      if (field === "on" && "aiEnabled" in result) saved.current = { ...saved.current, on: result.aiEnabled };
      setValues((v) => ({ ...v, [field]: saved.current[field] }));
      setFailed({ field, tried: next, withdrawal: withdrawalOnly || ("pending" in result && result.pending === "withdrawal") });
    });
  };

  const chip = (active: boolean) =>
    `inline-flex min-h-12 items-center rounded-full border px-4 text-sm font-medium aria-disabled:opacity-60 ${active ? "border-accent bg-pill text-accent" : "border-border text-muted hover:bg-pill"}`;

  return (
    <section aria-labelledby="me-ai" className="rounded-3xl border border-border bg-surface p-6">
      <h2 id="me-ai" className="text-lg font-medium text-text">
        {t("meAi")}
      </h2>
      <label className="mt-4 flex min-h-11 items-center justify-between gap-4 text-text">
        <span>{t("meAiOn")}</span>
        <input
          type="checkbox"
          role="switch"
          data-testid="me-ai-on"
          checked={values.on}
          aria-disabled={pending}
          onChange={(e) => save("on", e.target.checked)}
          className="h-6 w-6 accent-[var(--color-accent)] aria-disabled:opacity-60"
        />
      </label>
      <p className="mt-2 text-sm text-muted" data-testid="me-ai-consent">
        {t("consentAiBody")}
      </p>

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
                    checked={values.tone === tone}
                    aria-disabled={pending}
                    onChange={() => save("tone", tone)}
                    className="h-5 w-5 accent-[var(--color-accent)] aria-disabled:opacity-60"
                  />
                  <span className="flex flex-col">
                    <span>{t(TONE_KEYS[tone][0])}</span>
                    <span className="text-sm text-muted">{t(TONE_KEYS[tone][1])}</span>
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

      <div className="mt-6 border-t border-border pt-4" data-testid="me-ai-credits">
        <h3 className="text-sm font-medium text-text">{t("creditsTitle")}</h3>
        <p className="mt-1 text-text">{t("creditsBalance", { credits: credits.balance })}</p>
        {/* At a balance of 0, the steady Lite state (creditsOut is only the
            one-time notice when they run out; m9 spec, decision 122). */}
        {credits.balance <= 0 && <p className="mt-1 text-sm text-muted">{t("creditsLiteNow")}</p>}
      </div>

      {failed && !pending && (
        <div className="mt-4">
          <p role="alert" data-testid="me-ai-error" className="text-sm font-medium text-accent">
            {tt("errGeneric")}
          </p>
          <button type="button" data-testid="me-ai-retry" onClick={() => save(failed.field, failed.tried, failed.withdrawal)} className="mt-2 min-h-11 rounded-full border border-border px-4 text-sm font-medium text-text">
            {ta("tryAgain")}
          </button>
        </div>
      )}
    </section>
  );
}
