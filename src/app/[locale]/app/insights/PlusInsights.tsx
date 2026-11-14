"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { LongRange } from "@/lib/plus/longRange";
import type { MorePattern, MorePatternId, MoreWindow } from "@/lib/plus/morePatterns";
import { LockedItem, PlusLock, type PlusOffer } from "../PlusSheet";
import { segment } from "@/lib/ui/journalLayout";

// What Plus adds on Insights (decision 246; UX 11 Nov): Week, Month, 3 months
// and today's Patterns stay free. Locked and visible: a Year tab beside them,
// a "More patterns" row under today's card, and one quiet line under Your
// week. A tap opens the Plus sheet. Shown only to someone without Plus.

// Free: Year, All time and Year in review, locked; a tap opens the sheet.
export function YearTab({ offer }: { offer: PlusOffer }) {
  const t = useTranslations("plus");
  return (
    <>
      <LockedItem label={t("tabYear")} sheetTitle={t("sheetYear")} offer={offer} testId="insights-range-year" className={`${segment(false)} inline-flex items-center gap-1.5`} />
      <LockedItem label={t("tabAllTime")} sheetTitle={t("sheetAllTime")} offer={offer} testId="insights-range-all" className={`${segment(false)} inline-flex items-center gap-1.5`} />
      <LockedItem label={t("rowReview")} sheetTitle={t("sheetReview")} offer={offer} testId="insights-review" className={`${segment(false)} inline-flex items-center gap-1.5`} />
    </>
  );
}

// With Plus: Year and All time are tabs like the others, then Year in review.
export function PlusTabs({ current }: { current: LongRange | null }) {
  const t = useTranslations("plus");
  return (
    <>
      {([
        ["year", t("tabYear")],
        ["all", t("tabAllTime")],
      ] as const).map(([r, label]) => (
        <Link key={r} href={`/app/insights?range=${r}`} data-testid={`insights-range-${r}`} aria-current={current === r ? "page" : undefined} className={segment(current === r)}>
          {label}
        </Link>
      ))}
      <Link href="/app/insights/review" data-testid="insights-review" className={segment(false)}>
        {t("rowReview")}
      </Link>
    </>
  );
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

// offer: kept for its callers; the sheet is retired, so See Plus opens the Plus screen.
export function WeekLine({ offer: _offer }: { offer: PlusOffer }) {
  const t = useTranslations("plus");
  return (
    <div data-testid="insights-plus-line" className="mt-4 flex items-center gap-3 rounded-2xl border border-border px-[16px] py-[12px]">
      <p className="min-w-0 flex-1 text-sm">{t("weekLine")}</p>
      <Link href="/app/me/plus" data-testid="insights-plus-see" className="inline-flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 text-sm font-medium text-accent">
        <PlusLock />
        <span className="underline underline-offset-4">{t("seePlus")}</span>
      </Link>
    </div>
  );
}

// With Plus: More patterns, in today's Patterns card's style and footnote.
const MORE_TEXT: Record<MorePatternId, Record<"shown" | "same", string>> = {
  sleep: { shown: "patternsSleepShown", same: "patternsSleepSame" },
  movement: { shown: "patternsMovementShown", same: "patternsMovementSame" },
  stress: { shown: "patternsStressShown", same: "patternsStressSame" },
  weekdays: { shown: "moreWeekdaysShown", same: "moreWeekdaysSame" },
  writing: { shown: "moreWritingShown", same: "moreWritingSame" },
};
const FREE_LINES = new Set<MorePatternId>(["sleep", "movement", "stress"]);

export function MorePatternsCard({ patterns, window }: { patterns: MorePattern[]; window: MoreWindow }) {
  const t = useTranslations("plus");
  const ti = useTranslations("insights");
  const number = new Intl.NumberFormat(useLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const visible = patterns.filter((p): p is Extract<MorePattern, { state: "shown" | "same" }> => p.state !== "not_enough");
  return (
    <section data-testid="insights-more-patterns-card" aria-labelledby="more-patterns-title" className="mt-6 rounded-3xl border border-border bg-surface p-[20px]">
      <h2 id="more-patterns-title" className="text-lg font-medium text-text">
        {t("morePatterns")}
      </h2>
      <p className="text-sm text-muted">{window === "all" ? t("moreSubtitleAll") : t("moreSubtitleYear")}</p>
      {visible.length > 0 ? (
        <>
          <ul className="mt-3 space-y-2 text-sm text-text">
            {visible.map((p) => {
              const values = { a: number.format(p.a.mood), b: number.format(p.b.mood) };
              const key = MORE_TEXT[p.id][p.state];
              return (
                <li key={p.id} data-testid={`insights-more-pattern-${p.id}`} data-state={p.state}>
                  {FREE_LINES.has(p.id) ? ti(key as Parameters<typeof ti>[0], values) : t(key as Parameters<typeof t>[0], values)}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">{ti("patternsFootnote")}</p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted" data-testid="insights-more-patterns-none">
          {t("moreNone")}
        </p>
      )}
    </section>
  );
}
