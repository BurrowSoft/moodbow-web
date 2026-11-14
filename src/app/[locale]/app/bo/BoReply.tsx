"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { BoMessage } from "@/lib/journal/bo";
import { reportBoReply } from "./actions";

// One of Bo's replies as plain text, with Report under it. A reply that wasn't kept
// has nothing to report. The help button stays in the header throughout.
export function BoReply({ message, className }: { message: BoMessage; className: string }) {
  const t = useTranslations("bo");
  const [state, setState] = useState<"idle" | "pending" | "done" | "failed">("idle");
  const report = async () => {
    setState("pending");
    const { ok } = await reportBoReply(message.sentWith ? { clientKey: message.sentWith } : { id: message.id }).catch(() => ({ ok: false }));
    setState(ok ? "done" : "failed");
  };
  return (
    <div className="flex flex-col items-start gap-[4px] self-start">
      <p data-testid="bo-message-ai" className={className}>
        {message.body}
      </p>
      {state === "done" ? (
        <p role="status" data-testid="bo-report-done" className="text-sm text-muted">
          {t("reportScreen")}
        </p>
      ) : (
        !message.unkept && (
          <button type="button" data-testid="bo-report" disabled={state === "pending"} onClick={() => void report()} className="inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4">
            {t("reportAction")}
          </button>
        )
      )}
      {state === "failed" && (
        <p role="alert" data-testid="bo-report-failed" className="text-sm text-text">
          {t("consentFailed")}
        </p>
      )}
    </div>
  );
}
