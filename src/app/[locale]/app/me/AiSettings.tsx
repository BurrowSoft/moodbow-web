"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FOCUS_AREAS, TONES, type FocusArea, type Tone } from "@/lib/journal/ai";
import { saveFocusAreas, saveTone, setAiEnabled, type AiSaveResult } from "./actions";

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
export function AiSettings({ initial, credits }: { initial: Values; credits: { balance: number; lite: boolean } }) {
  const t = useTranslations("ai");
  const ta = useTranslations("app");
  const tt = useTranslations("today");
  const [values, setValues] = useState(initial);
  // What the account has (the last successful save of each field).
  const saved = useRef(initial);
  const [failed, setFailed] = useState<{ field: Field; tried: Values[Field] } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = <F extends Field>(field: F, next: Values[F]) => {
    setFailed(null);
    setValues((v) => ({ ...v, [field]: next }));
    startTransition(async () => {
      let result: AiSaveResult;
      try {
        result = field === "on" ? await setAiEnabled(next as boolean) : field === "tone" ? await saveTone(next as Tone) : await saveFocusAreas(next as FocusArea[]);
      } catch (e) {
        if (typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")) throw e;
        result = { ok: false };
      }
      if (result.ok) {
        saved.current = { ...saved.current, [field]: next };
      } else {
        setValues((v) => ({ ...v, [field]: saved.current[field] }));
        setFailed({ field, tried: next });
      }
    });
  };

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${active ? "border-accent bg-pill text-accent" : "border-border text-muted hover:bg-pill"}`;

  return (
    <section aria-labelledby="me-ai" className="rounded-3xl border border-border bg-surface p-6" aria-busy={pending}>
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
          disabled={pending}
          onChange={(e) => save("on", e.target.checked)}
          className="h-6 w-6 accent-[var(--color-accent)]"
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
                    disabled={pending}
                    onChange={() => save("tone", tone)}
                    className="h-5 w-5 accent-[var(--color-accent)]"
                  />
                  <span>
                    {t(TONE_KEYS[tone][0])} <span className="text-sm text-muted">· {t(TONE_KEYS[tone][1])}</span>
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
                    disabled={pending}
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
        {credits.lite && <p className="mt-1 text-sm text-muted">{t("creditsOut")}</p>}
      </div>

      {failed && !pending && (
        <div className="mt-4">
          <p role="alert" data-testid="me-ai-error" className="text-sm font-medium text-accent">
            {tt("errGeneric")}
          </p>
          <button type="button" data-testid="me-ai-retry" onClick={() => save(failed.field, failed.tried)} className="mt-2 min-h-11 rounded-full border border-border px-4 text-sm font-medium text-text">
            {ta("tryAgain")}
          </button>
        </div>
      )}
    </section>
  );
}
