"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useUntilLoaded } from "@/lib/ui/untilLoaded";
import { setBoReadsJournal, turnBoOff } from "./actions";
import { ClearBo } from "./ClearBo";

// Me → Your conversation with Bo, also where Bo is off: the conversation stays the
// person's to export and clear. Use Bo is the AI consent: off withdraws it, on goes
// through the consent on Bo's screen, and can't be turned on where Bo isn't available
// (canTurnOn). The journal switch needs it on, and never shows without its line.
export function BoMeRow({ hasConversation, readsJournal, consented, canTurnOn }: { hasConversation: boolean; readsJournal: boolean; consented: boolean; canTurnOn: boolean }) {
  const untilLoaded = useUntilLoaded();
  const router = useRouter();
  const t = useTranslations("bo");
  const tm = useTranslations("me");
  const [has, setHas] = useState(hasConversation);
  const [on, setOn] = useState(consented);
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
  const chooseBo = async (next: boolean) => {
    if (next) return router.push("/app/bo");
    if (pending) return;
    setPending(true);
    setFailed(false);
    const { ok } = await turnBoOff().catch(() => ({ ok: false }));
    setPending(false);
    if (!ok) return setFailed(true);
    setOn(false);
    setReads(false);
  };
  return (
    <section {...untilLoaded} aria-labelledby="me-bo" data-testid="me-bo" className="rounded-3xl border border-border bg-surface p-6">
      <h2 id="me-bo" className="text-lg font-medium text-text">
        {t("meRow")}
      </h2>
      {(on || canTurnOn) && (
        <label className="mt-4 flex min-h-11 items-center justify-between gap-4 text-text">
          <span className="min-w-0 [overflow-wrap:anywhere]">{t("useBo")}</span>
          <input type="checkbox" role="switch" data-testid="me-bo-use" checked={on} onChange={(e) => void chooseBo(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--accent)]" />
        </label>
      )}
      {on && (
        <>
          <label className="mt-4 flex min-h-11 items-center justify-between gap-4 text-text">
            <span className="min-w-0 [overflow-wrap:anywhere]">{t("journalSwitch")}</span>
            <input type="checkbox" role="switch" data-testid="me-bo-journal" aria-describedby="me-bo-journal-note" checked={reads} onChange={(e) => void toggle(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--accent)]" />
          </label>
          <p id="me-bo-journal-note" data-testid="me-bo-journal-note" className="mt-1 text-sm text-muted">
            {t("journalSwitchNote")}
          </p>
        </>
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
