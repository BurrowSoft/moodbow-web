"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RECALL_MONTHS, toggleRecall, type RecallMonth } from "@/lib/journal/momentRecall";
import { setMomentRecall } from "../actions";

// "Bring this back in" [1 month] [6 months] [1 year] (spec "Memories"; board 20): a card under the
// entry, toggle chips saved on each tap, a ✓ on each one that's on (never colour alone; aria-pressed
// says it too), and a line on what it does. A failed save puts the chip back and says so. All off
// keeps it a moment that never comes back as a memory.
const LABEL: Record<RecallMonth, "recall1" | "recall6" | "recall12"> = { 1: "recall1", 6: "recall6", 12: "recall12" };

export function RecallChips({ id, value, onChange }: { id: string; value: RecallMonth[]; onChange: (next: RecallMonth[]) => void }) {
  const t = useTranslations("entry");
  const tt = useTranslations("today");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const tap = async (m: RecallMonth) => {
    if (busy) return;
    const before = value;
    const next = toggleRecall(value, m);
    onChange(next);
    setBusy(true);
    setFailed(false);
    const result = await setMomentRecall(id, next).catch(() => null);
    setBusy(false);
    if (result?.status !== "ok") {
      onChange(before);
      setFailed(true);
    } else onChange(result.months);
  };
  return (
    <div role="group" aria-labelledby="entry-recall-title" aria-describedby="entry-recall-help" data-testid="entry-recall" className="flex flex-col gap-[10px] rounded-2xl border border-border bg-surface p-[14px]">
      <h2 id="entry-recall-title" className="text-sm font-medium text-text">
        {t("recallIn")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {RECALL_MONTHS.map((m) => {
          const on = value.includes(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              data-testid={`entry-recall-${m}`}
              onClick={() => void tap(m)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] px-4 text-sm text-text ${on ? "border-accent bg-pill" : "border-border bg-surface"}`}
            >
              {on && (
                <svg aria-hidden="true" data-testid={`entry-recall-${m}-check`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
              {t(LABEL[m])}
            </button>
          );
        })}
      </div>
      <p id="entry-recall-help" className="text-xs text-muted">
        {t("recallHelp")}
      </p>
      {failed && (
        <p role="alert" data-testid="entry-recall-error" className="w-full text-sm font-medium text-accent">
          {tt("errGeneric")}
        </p>
      )}
    </div>
  );
}
