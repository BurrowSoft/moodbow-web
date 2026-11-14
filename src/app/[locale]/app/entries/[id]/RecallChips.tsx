"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RECALL_MONTHS, toggleRecall, type RecallMonth } from "@/lib/journal/momentRecall";
import { setMomentRecall } from "../actions";

// "Bring this back in: [1 month] [6 months] [1 year]" (spec "Memories"): toggle chips, saved on
// each tap; a failed save puts the chip back and says so. All off keeps it a moment that never
// comes back as a memory.
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
    <div role="group" aria-label={t("recallTitle")} data-testid="entry-recall" className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-text">{t("recallIn")}</span>
      {RECALL_MONTHS.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value.includes(m)}
          data-testid={`entry-recall-${m}`}
          onClick={() => void tap(m)}
          className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${value.includes(m) ? "border-accent bg-pill text-accent" : "border-border text-muted"}`}
        >
          {t(LABEL[m])}
        </button>
      ))}
      {failed && (
        <p role="alert" data-testid="entry-recall-error" className="w-full text-sm font-medium text-accent">
          {tt("errGeneric")}
        </p>
      )}
    </div>
  );
}
