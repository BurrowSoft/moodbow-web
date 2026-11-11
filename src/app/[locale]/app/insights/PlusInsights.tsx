"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LockedItem, PlusLock, PlusSheet, type PlusOffer } from "@/components/plus/PlusSheet";
import { segment } from "@/lib/ui/journalLayout";

// What Plus adds on Insights (decision 246; UX 11 Nov): Week, Month, 3 months
// and today's Patterns stay free. Locked and visible: a Year tab beside them,
// a "More patterns" row under today's card, and one quiet line under Your
// week. A tap opens the Plus sheet. Shown only to someone without Plus.

export function YearTab({ offer }: { offer: PlusOffer }) {
  const t = useTranslations("plus");
  return <LockedItem label={t("tabYear")} sheetTitle={t("sheetYear")} offer={offer} testId="insights-range-year" className={`${segment(false)} inline-flex items-center gap-1.5`} />;
}

export function MorePatternsRow({ offer }: { offer: PlusOffer }) {
  const t = useTranslations("plus");
  return (
    <LockedItem
      label={t("morePatterns")}
      sheetTitle={t("sheetMorePatterns")}
      offer={offer}
      testId="insights-more-patterns"
      className="mt-3 flex w-full items-center justify-between gap-3 rounded-3xl border border-border bg-surface p-[20px] text-left"
    >
      <span className="mt-1 block text-sm text-muted">{t("morePatternsBody")}</span>
    </LockedItem>
  );
}

export function WeekLine({ offer }: { offer: PlusOffer }) {
  const t = useTranslations("plus");
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="insights-plus-line" className="mt-4 flex items-center gap-3 rounded-2xl border border-border px-[16px] py-[12px]">
      <p className="min-w-0 flex-1 text-sm">{t("weekLine")}</p>
      <button type="button" data-testid="insights-plus-see" onClick={() => setOpen(true)} className="inline-flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 text-sm font-medium text-accent">
        <PlusLock />
        <span className="underline underline-offset-4">{t("seePlus")}</span>
      </button>
      {open && <PlusSheet title={t("sheetYear")} offer={offer} onClose={() => setOpen(false)} />}
    </div>
  );
}
