"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useUntilLoaded } from "@/lib/ui/untilLoaded";
import { setBoReadsJournal } from "./actions";
import { ClearBo } from "./ClearBo";

// Me → Your conversation with Bo, also where Bo is off: the conversation stays the
// person's to export and clear. The switch needs the AI consent, so only with it.
export function BoMeRow({ hasConversation, readsJournal, consented }: { hasConversation: boolean; readsJournal: boolean; consented: boolean }) {
  const untilLoaded = useUntilLoaded();
  const t = useTranslations("bo");
  const tm = useTranslations("me");
  const [has, setHas] = useState(hasConversation);
  const [reads, setReads] = useState(readsJournal);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const toggle = async (next: boolean) => {
    // Input is ignored while saving, not disabled: that would drop keyboard focus.
    if (pending) return;
    setPending(true);
    setFailed(false);
    setReads(next);
    const { ok } = await setBoReadsJournal(next).catch(() => ({ ok: false }));
    setPending(false);
    if (ok) return;
    setReads(!next);
    setFailed(true);
  };
  return (
    <section {...untilLoaded} aria-labelledby="me-bo" data-testid="me-bo" className="rounded-3xl border border-border bg-surface p-6">
      <h2 id="me-bo" className="text-lg font-medium text-text">
        {t("meRow")}
      </h2>
      {consented && (
        <label className="mt-4 flex min-h-11 items-center justify-between gap-4 text-text">
          <span className="min-w-0 [overflow-wrap:anywhere]">{t("journalSwitch")}</span>
          <input type="checkbox" role="switch" data-testid="me-bo-journal" checked={reads} onChange={(e) => void toggle(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--accent)]" />
        </label>
      )}
      {failed && (
        <p role="alert" data-testid="me-bo-failed" className="mt-2 text-sm text-text">
          {t("consentFailed")}
        </p>
      )}
      {has ? (
        <div className="mt-4 flex flex-wrap items-center gap-[12px]">
          <a href="#me-your-data" data-testid="me-bo-export" className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4">
            {tm("meExport")}
          </a>
          <ClearBo testId="me-bo-clear" onCleared={() => setHas(false)} />
        </div>
      ) : (
        <p data-testid="me-bo-empty" className="mt-4 text-sm text-muted">
          {t("meRowEmpty")}
        </p>
      )}
    </section>
  );
}
