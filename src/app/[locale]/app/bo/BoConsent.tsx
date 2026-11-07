"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PRIMARY_SAVE } from "@/lib/ui/journalLayout";
import { giveBoConsent } from "./actions";

// Bo's first open, for anyone without a current AI consent. The body is the English
// draft (specs/bo-legal-drafts.md), marked as a placeholder in every language until
// Vitor's text and its translations are in; bo.test.ts keeps bo-live off while it is. Not now
// leaves the rest of the journal as it was.
export function BoConsent({ onGiven }: { onGiven: () => void }) {
  const t = useTranslations("bo");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const give = async () => {
    setPending(true);
    setFailed(false);
    const { ok } = await giveBoConsent().catch(() => ({ ok: false }));
    setPending(false);
    if (ok) onGiven();
    else setFailed(true);
  };
  return (
    <section data-testid="bo-consent" aria-labelledby="bo-consent-title" className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-[16px]">
      <h2 id="bo-consent-title" className="text-lg font-medium text-text">
        {t("consentTitle")}
      </h2>
      <p data-testid="bo-consent-body" className="whitespace-pre-line text-text">
        {t("consentBody")}
      </p>
      {failed && (
        <p role="alert" data-testid="bo-consent-failed" className="text-text">
          {t("consentFailed")}
        </p>
      )}
      <button type="button" data-testid="bo-consent-accept" disabled={pending} onClick={() => void give()} className={PRIMARY_SAVE}>
        {t("consentAccept")}
      </button>
      <Link href="/app" data-testid="bo-consent-decline" className="inline-flex min-h-12 max-w-full items-center self-start rounded-full px-[12px] font-medium text-accent underline underline-offset-4 [overflow-wrap:anywhere]">
        {t("consentDecline")}
      </Link>
    </section>
  );
}
