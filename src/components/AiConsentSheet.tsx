"use client";

import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { wholeNames } from "@/lib/wholeNames";

// The one-time "Turn on AI?" sheet (board 30c), opened by Me → AI's switch and by Insights → AI's
// invitation (decision 258): the consent text word for word. Focus starts on Not now, the choice that
// records nothing; Escape and a tap outside are Not now too. It records nothing itself: only the
// caller's onTurnOn does, through setAiEnabled with this build's version (and so aiConsentWrite).
export function AiConsentSheet({ testId, onNotNow, onTurnOn }: { testId: string; onNotNow: () => void; onTurnOn: () => void }) {
  const t = useTranslations("ai");
  return (
    <Dialog title={t("aiConfirmTitle")} body={wholeNames(t("consentAiBody"))} onCancel={onNotNow} cancelOnBackdrop testId={testId}>
      <button type="button" data-testid={`${testId}-not-now`} onClick={onNotNow} className={dialogButton()}>
        {t("aiConfirmNotNow")}
      </button>
      <button type="button" data-testid={`${testId}-turn-on`} onClick={onTurnOn} className={dialogButton(true)}>
        {t("aiConfirmTurnOn")}
      </button>
    </Dialog>
  );
}
