"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { clearBoConversation } from "./actions";

// Clear conversation, in Me and on Bo's screen when it's full. It uses the database
// directly, so it works where Bo is off too. A report already made isn't removed.
// Focus opens on Cancel, the safe choice.
export function ClearBo({ onCleared, testId }: { onCleared: () => void; testId: string }) {
  const t = useTranslations("bo");
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const cancel = useCallback(() => setAsking(false), []);
  const clear = async () => {
    setPending(true);
    setFailed(false);
    const { ok } = await clearBoConversation().catch(() => ({ ok: false }));
    setPending(false);
    if (!ok) return setFailed(true);
    setAsking(false);
    onCleared();
  };
  return (
    <>
      <button type="button" data-testid={testId} onClick={() => setAsking(true)} className={dialogButton()}>
        {t("clearAction")}
      </button>
      {asking && (
        <Dialog
          title={t("clearTitle")}
          body={t("clearBody")}
          details={failed ? <p role="alert" data-testid="bo-clear-failed">{t("consentFailed")}</p> : undefined}
          onCancel={cancel}
          testId="bo-clear-dialog"
        >
          <button type="button" data-testid="bo-clear-cancel" onClick={cancel} className={dialogButton()}>
            {t("cancel")}
          </button>
          <button type="button" data-testid="bo-clear-confirm" disabled={pending} onClick={() => void clear()} className={dialogButton(true)}>
            {t("clearConfirm")}
          </button>
        </Dialog>
      )}
    </>
  );
}
