"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { primaryButtonClass, textLinkClass } from "@/components/AuthField";
import { BackLink } from "@/components/BackLink";
import { giveConsent, type ConsentState } from "./actions";

const noSubscribe = () => () => {};

function Checkbox({ name, label, checked, onChange, testId }: { name: string; label: string; checked: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <label className="flex items-start gap-[12px] rounded-2xl border border-border bg-surface p-[16px] text-text">
      <input
        type="checkbox"
        name={name}
        data-testid={testId}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
        className="mt-[4px] h-[20px] w-[20px] shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">{label}</span>
    </label>
  );
}

// Every box here is required (the action checks again). Once the page is
// running, Continue stays disabled until they're all ticked; before that
// (no JS yet, decision 73) it's a plain form: the browser's own required
// check, then the server's. askAi: the optional AI box (r1 §M3), never
// required and never pre-ticked; hidden while this build doesn't show AI.
// showBack: new accounts only (Back → Welcome slide 3, the privacy promise).
export function ConsentForm({ askAge, askAi = false, showBack }: { askAge: boolean; askAi?: boolean; showBack: boolean }) {
  const tai = useTranslations("ai");
  const t = useTranslations("onboarding");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [state, action, pending] = useActionState<ConsentState, FormData>(giveConsent, { status: "idle" });
  const [privacy, setPrivacy] = useState(false);
  const [health, setHealth] = useState(false);
  const [age, setAge] = useState(false);
  const ready = privacy && health && (!askAge || age);
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);

  return (
    // Below the wide layout (rem-based, so large text counts as narrow), under the safety card's cap, in px, so the words this page asks someone to agree to stay whole
    // at large text: at 300 % they were 48 px, with "J'accepte" over four lines (Web Tester). It's
    // the type that stops growing, and nothing is cut off: the page still scrolls.
    <form action={action} className="space-y-[16px] max-sm:[font-size:min(1rem,max(8vw,16px))]">
      <Checkbox name="privacy" testId="consent-privacy" label={t("consentPrivacy")} checked={privacy} onChange={setPrivacy} />
      <p className="flex flex-wrap gap-x-[24px] gap-y-[4px] px-[4px] leading-[1.429] [font-size:min(0.875rem,max(7vw,14px))]">
        <Link href="/terms" target="_blank" rel="noopener" data-testid="consent-read-terms" className={textLinkClass}>
          {t("consentReadTerms")}
          {" "}
          <span className="sr-only">{tc("opensInNewTab")}</span>
        </Link>
        <Link href="/privacy" target="_blank" rel="noopener" data-testid="consent-read-privacy" className={textLinkClass}>
          {t("consentReadPrivacy")}
          {" "}
          <span className="sr-only">{tc("opensInNewTab")}</span>
        </Link>
      </p>
      {/* The legal pages are in English for now, as on the app (UX 2026-11-05). */}
      {locale !== "en" && (
        <p data-testid="consent-legal-english" className="px-[4px] text-muted leading-[1.429] [font-size:min(0.875rem,max(7vw,14px))]">
          {t("consentLegalEnglish")}
        </p>
      )}
      <Checkbox name="health" testId="consent-health" label={t("consentHealth")} checked={health} onChange={setHealth} />
      {askAge && <Checkbox name="age" testId="consent-age" label={t("ageConfirm")} checked={age} onChange={setAge} />}
      {askAi && (
        <label className="flex items-start gap-[12px] rounded-2xl border border-border bg-surface p-[16px] text-text">
          <input type="checkbox" name="ai" data-testid="consent-ai" aria-describedby="consent-ai-body" className="mt-[4px] h-[20px] w-[20px] shrink-0 accent-[var(--accent)]" />
          <span className="flex min-w-0 flex-col gap-[4px]">
            <span className="font-medium">{tai("consentAiTitle")}</span>
            <span id="consent-ai-body" aria-hidden="true" className="text-muted leading-[1.429] [font-size:min(0.875rem,max(7vw,14px))]">
              {tai("consentAiBody")}
            </span>
          </span>
        </label>
      )}
      {state.status === "error" && (
        <p role="alert" data-testid="consent-error" className="font-medium text-accent">
          {state.error === "age" ? t("errAgeRequired") : ta("errGeneric")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-[24px] pt-[8px]">
        <button type="submit" data-testid="consent-continue" disabled={(hydrated && !ready) || pending} className={`${primaryButtonClass} max-sm:[font-size:min(1rem,max(8vw,16px))]`}>
          {t("consentContinue")}
        </button>
        {showBack && <BackLink href="/welcome?slide=3" label={t("back")} testId="consent-back" />}
      </div>
    </form>
  );
}
