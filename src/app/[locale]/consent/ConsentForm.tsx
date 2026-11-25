"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { primaryButtonClass, textLinkClass } from "@/components/AuthField";
import { BackLink } from "@/components/BackLink";
import { wholeNames } from "@/lib/wholeNames";
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
        className="mt-[2px] h-[24px] w-[24px] shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">{wholeNames(label)}</span>
    </label>
  );
}

// Every box here is required (the action checks again). Once the page is
// running, Continue stays disabled until they're all ticked; before that
// (no JS yet, decision 73) it's a plain form: the browser's own required
// check, then the server's. No AI box: AI consent is asked only in Me → AI,
// where AI is actually available (UX, 23 Nov, the AI go-live, as the app).
// showBack: new accounts only (Back → Welcome slide 3, the privacy promise).
export function ConsentForm({ askAge, showBack, legalInEnglish = false }: { askAge: boolean; showBack: boolean; legalInEnglish?: boolean }) {
  const t = useTranslations("onboarding");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<ConsentState, FormData>(giveConsent, { status: "idle" });
  const [privacy, setPrivacy] = useState(false);
  const [health, setHealth] = useState(false);
  const [age, setAge] = useState(false);
  const ready = privacy && health && (!askAge || age);
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);

  return (
    // Below the wide layout (rem-based, so large text counts as narrow), type stops growing at about
    // 200 % (decision 231): at 300 % it was 48 px, with "J'accepte" over four lines (Web Tester). A long
    // word may still split. Nothing is cut off: the page still scrolls, and pinch zoom stays on.
    <form action={action} data-hyphenate className="space-y-[16px] max-sm:[font-size:min(1rem,max(10vw,32px))]">
      <Checkbox name="privacy" testId="consent-privacy" label={t("consentPrivacy")} checked={privacy} onChange={setPrivacy} />
      {/* Each link is a 44 px tall tap area (Web Tester batch E), so wrapped rows need no gap of their own. */}
      <p className="flex flex-wrap gap-x-[24px] px-[4px] leading-[1.429] [font-size:min(0.875rem,max(8.75vw,28px))]">
        <Link href="/terms" target="_blank" rel="noopener" data-testid="consent-read-terms" className={`${textLinkClass} inline-flex min-h-11 items-center`}>
          {wholeNames(t("consentReadTerms"))}
          {" "}
          <span className="sr-only">{wholeNames(tc("opensInNewTab"))}</span>
        </Link>
        <Link href="/privacy" target="_blank" rel="noopener" data-testid="consent-read-privacy" className={`${textLinkClass} inline-flex min-h-11 items-center`}>
          {wholeNames(t("consentReadPrivacy"))}
          {" "}
          <span className="sr-only">{wholeNames(tc("opensInNewTab"))}</span>
        </Link>
      </p>
      {/* Said only where the Terms and Privacy Policy really are in English here. */}
      {legalInEnglish && (
        <p data-testid="consent-legal-english" className="px-[4px] text-muted leading-[1.429] [font-size:min(0.875rem,max(8.75vw,28px))]">
          {wholeNames(t("consentLegalEnglish"))}
        </p>
      )}
      <Checkbox name="health" testId="consent-health" label={t("consentHealth")} checked={health} onChange={setHealth} />
      {askAge && <Checkbox name="age" testId="consent-age" label={t("ageConfirm")} checked={age} onChange={setAge} />}
      {state.status === "error" && (
        <p role="alert" data-testid="consent-error" className="font-medium text-accent">
          {state.error === "age" ? t("errAgeRequired") : ta("errGeneric")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-[24px] pt-[8px]">
        <button type="submit" data-testid="consent-continue" data-count="consent_continue" disabled={(hydrated && !ready) || pending} className={`${primaryButtonClass} max-sm:[font-size:min(1rem,max(10vw,32px))]`}>
          {wholeNames(t("consentContinue"))}
        </button>
        {showBack && <BackLink href="/welcome?slide=3" label={t("back")} testId="consent-back" />}
      </div>
    </form>
  );
}
