"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { primaryButtonClass, textLinkClass } from "@/components/AuthField";
import { BackLink } from "@/components/BackLink";
import { giveConsent, type ConsentState } from "./actions";

function Checkbox({ name, label, checked, onChange, testId }: { name: string; label: string; checked: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-4 text-text">
      <input
        type="checkbox"
        name={name}
        data-testid={testId}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
      />
      <span>{label}</span>
    </label>
  );
}

// Continue stays disabled until every required box is ticked (the action
// checks again). The AI row is hidden while AI is off.
// showBack: new accounts only (Back → Welcome slide 3, the privacy promise).
export function ConsentForm({ askAge, showBack }: { askAge: boolean; showBack: boolean }) {
  const t = useTranslations("onboarding");
  const ta = useTranslations("auth");
  const [state, action, pending] = useActionState<ConsentState, FormData>(giveConsent, { status: "idle" });
  const [privacy, setPrivacy] = useState(false);
  const [health, setHealth] = useState(false);
  const [age, setAge] = useState(false);
  const ready = privacy && health && (!askAge || age);

  return (
    <form action={action} className="space-y-4">
      <Checkbox name="privacy" testId="consent-privacy" label={t("consentPrivacy")} checked={privacy} onChange={setPrivacy} />
      <p className="flex flex-wrap gap-x-6 gap-y-1 px-1 text-sm">
        <Link href="/terms" target="_blank" rel="noopener" data-testid="consent-read-terms" className={textLinkClass}>
          {t("consentReadTerms")}
        </Link>
        <Link href="/privacy" target="_blank" rel="noopener" data-testid="consent-read-privacy" className={textLinkClass}>
          {t("consentReadPrivacy")}
        </Link>
      </p>
      <Checkbox name="health" testId="consent-health" label={t("consentHealth")} checked={health} onChange={setHealth} />
      {askAge && <Checkbox name="age" testId="consent-age" label={t("ageConfirm")} checked={age} onChange={setAge} />}
      {state.status === "error" && (
        <p role="alert" data-testid="consent-error" className="font-medium text-accent">
          {state.error === "age" ? t("errAgeRequired") : ta("errGeneric")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-6 pt-2">
        <button type="submit" data-testid="consent-continue" disabled={!ready || pending} className={primaryButtonClass}>
          {t("consentContinue")}
        </button>
        {showBack && <BackLink href="/welcome?slide=3" label={t("back")} testId="consent-back" />}
      </div>
    </form>
  );
}
