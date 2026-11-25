"use client";

import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AiConsentSheet } from "@/components/AiConsentSheet";
import { dialogButton } from "@/components/Dialog";
import { useRouter } from "@/i18n/navigation";
import { POLICY_VERSIONS } from "@/lib/legalVersions";
import { JOURNAL_CARD } from "@/lib/ui/journalLayout";
import { wholeNames } from "@/lib/wholeNames";
import { setAiEnabled } from "../me/actions";

const isRedirect = (e: unknown) => typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT");

// Insights → AI while this person's AI is off (decision 258, board 30b): one invitation. Its button only
// opens the one-time sheet (the same as Me → AI's), never turns AI on itself; Not now records nothing.
// Only the sheet's Turn on AI saves, through Me's own action at this build's version (setAiEnabled →
// aiConsentWrite, the consent's one writer), and then the page reads again, as AI on.
export function AiInvite() {
  const t = useTranslations("ai");
  const tt = useTranslations("today");
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const notNow = useCallback(() => setAsking(false), []);
  const turnOn = () => {
    setAsking(false);
    setFailed(false);
    startTransition(async () => {
      let ok = false;
      try {
        ok = (await setAiEnabled(true, { version: POLICY_VERSIONS.ai })).ok;
      } catch (e) {
        if (isRedirect(e)) throw e;
      }
      if (ok) router.refresh();
      else setFailed(true);
    });
  };
  return (
    <section aria-labelledby="ai-invite-title" data-testid="insights-ai-invite" className={`mt-6 flex flex-col items-center gap-[14px] text-center ${JOURNAL_CARD}`}>
      {/* The arcs in the accent, as on the Plus card: the Sunrise colours are only ever the person's own values (decision 150). */}
      <svg aria-hidden="true" width="72" height="40" viewBox="0 0 72 40" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className="shrink-0 text-accent">
        <path d="M6 36a30 30 0 0 1 60 0" />
        <path d="M15 36a21 21 0 0 1 42 0" opacity="0.7" />
        <path d="M24 36a12 12 0 0 1 24 0" opacity="0.45" />
      </svg>
      <h2 id="ai-invite-title" className="text-lg font-medium text-text [overflow-wrap:anywhere]">
        {wholeNames(t("aiInviteTitle"))}
      </h2>
      <p className="text-muted [overflow-wrap:anywhere]">{wholeNames(t("aiInviteBody"))}</p>
      <button type="button" data-testid="insights-ai-invite-turn-on" aria-disabled={pending} onClick={() => !pending && setAsking(true)} className={`${dialogButton(true)} aria-disabled:opacity-50`}>
        {t("aiConfirmTurnOn")}
      </button>
      {failed && !pending && (
        <p role="alert" data-testid="insights-ai-invite-error" className="text-sm font-medium text-accent">
          {tt("errGeneric")}
        </p>
      )}
      {asking && <AiConsentSheet testId="insights-ai-sheet" onNotNow={notNow} onTurnOn={turnOn} />}
    </section>
  );
}
