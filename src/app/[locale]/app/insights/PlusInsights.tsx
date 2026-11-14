"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { LongRange } from "@/lib/plus/longRange";
import type { MorePattern, MorePatternId, MoreWindow } from "@/lib/plus/morePatterns";
import type { TagPattern } from "@/lib/plus/tagPatterns";
import type { Lift } from "@/lib/plus/whatLiftsMe";
import { GetHelpNow } from "@/components/SafetyCard";
import { LockedItem, PlusLock, PlusSheet, type PlusOffer } from "../PlusSheet";
import { segment } from "@/lib/ui/journalLayout";
import { MoodPair } from "@/components/MoodPair";
import { PATTERN_PAIR } from "@/lib/journal/patternPair";

// What Plus adds on Insights (decision 246; UX 11 Nov): Week, Month, 3 months
// and today's Patterns stay free. Locked and visible: a Year tab beside them,
// a "More patterns" row under today's card, and one quiet line under Your
// week. A tap opens the Plus sheet. Shown only to someone without Plus.

// Free: Year and All time, locked; a tap opens the sheet.
export function YearTab({ offer }: { offer: PlusOffer }) {
  const t = useTranslations("plus");
  return (
    <>
      <LockedItem label={t("tabYear")} sheetTitle={t("sheetYear")} offer={offer} testId="insights-range-year" className={`${segment(false)} inline-flex items-center gap-1.5`} />
      <LockedItem label={t("tabAllTime")} sheetTitle={t("sheetAllTime")} offer={offer} testId="insights-range-all" className={`${segment(false)} inline-flex items-center gap-1.5`} />
    </>
  );
}

// With Plus: Year and All time are tabs like the others.
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

// With Plus: More patterns, in today's Patterns card's style and footnote.
const MORE_TEXT: Record<MorePatternId, Record<"shown" | "same", string>> = {
  sleep: { shown: "patternsSleepShown", same: "patternsSleepSame" },
  movement: { shown: "patternsMovementShown", same: "patternsMovementSame" },
  stress: { shown: "patternsStressShown", same: "patternsStressSame" },
  weekdays: { shown: "moreWeekdaysShown", same: "moreWeekdaysSame" },
  writing: { shown: "moreWritingShown", same: "moreWritingSame" },
};
const FREE_LINES = new Set<MorePatternId>(["sleep", "movement", "stress"]);

// tags: More patterns by tag (UX, 12 Nov), already chosen and ordered (lib/plus/tagPatterns), at
// most 5; each tag shown as written, as plain text.
// lifts: What lifts me (1.3), already chosen and ordered (lib/plus/whatLiftsMe), at most 3; null when
// tags are off or couldn't be read (nothing shown, never a guess). It shows the person's own words,
// so the quiet Get help now sits beside its title (the ruling, the 11 Nov rule).
export function MorePatternsCard({ patterns, window, tags = [], lifts = null, country = null }: { patterns: MorePattern[]; window: MoreWindow; tags?: TagPattern[]; lifts?: Lift[] | null; country?: string | null }) {
  const t = useTranslations("plus");
  const ti = useTranslations("insights");
  const number = new Intl.NumberFormat(useLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const signed = new Intl.NumberFormat(useLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
  // Board 3's layout (UX, 14 Nov): a title and two labelled rows; the sentence is the image's name.
  const bars = (sentence: string, title: string, labels: [string, string], a: number, b: number, testId: string) => (
    <MoodPair sentence={sentence} title={title} labels={labels} a={a} b={b} format={(v) => number.format(v)} signed={(v) => signed.format(v)} testId={testId} />
  );
  const tagged = (tag: string): [string, [string, string]] => [ti("pairTag", { tag }), [ti("pairWith", { tag }), ti("pairOther")]];
  const visible = patterns.filter((p): p is Extract<MorePattern, { state: "shown" | "same" }> => p.state !== "not_enough");
  const tagList =
    tags.length > 0 ? (
      <section aria-labelledby="more-tags-title" data-testid="insights-more-tags" className="mt-4">
        <h3 id="more-tags-title" className="text-sm font-medium text-text">
          {t("moreTagsTitle")}
        </h3>
        <ul className="mt-2 space-y-2 text-sm text-text">
          {tags.map((p) => (
            <li key={p.tag} data-testid="insights-more-tag" data-state={p.state} className="[overflow-wrap:anywhere]">
              {bars(t(p.state === "shown" ? "moreTagShown" : "moreTagSame", { tag: p.tag, a: number.format(p.a.mood), b: number.format(p.b.mood) }), ...tagged(p.tag), p.a.mood, p.b.mood, "insights-more-tag-bars")}
            </li>
          ))}
        </ul>
      </section>
    ) : null;
  const liftList = lifts ? (
    <section aria-labelledby="lifts-title" data-testid="insights-lifts" className="mt-4">
      <div className="flex items-start justify-between gap-3">
        <h3 id="lifts-title" className="min-w-0 pt-[12px] text-sm font-medium text-text">
          {t("liftsTitle")}
        </h3>
        <GetHelpNow country={country} testId="lifts-get-help" neutral icon />
      </div>
      {lifts.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm text-text">
          {lifts.map((l) => (
            <li key={l.tag} data-testid="insights-lift" className="[overflow-wrap:anywhere]">
              {bars(t("liftsRow", { tag: l.tag, a: number.format(l.a.mood), b: number.format(l.b.mood) }), ...tagged(l.tag), l.a.mood, l.b.mood, "insights-lift-bars")}
            </li>
          ))}
        </ul>
      ) : (
        <p data-testid="insights-lifts-none" className="mt-2 text-sm text-muted">
          {t("liftsNone")}
        </p>
      )}
      <p data-testid="insights-lifts-footer" className="mt-2 text-xs text-muted">
        {t("liftsFooter")}
      </p>
    </section>
  ) : null;
  return (
    <section data-testid="insights-more-patterns-card" aria-labelledby="more-patterns-title" className="mt-6 rounded-3xl border border-border bg-surface p-[20px]">
      <h2 id="more-patterns-title" className="text-lg font-medium text-text">
        {t("morePatterns")}
      </h2>
      <p className="text-sm text-muted">
        {window === "all" ? t("moreSubtitleAll") : t("moreSubtitleYear")}
        <span className="ms-[8px] text-xs">{ti("moodScale")}</span>
      </p>
      {visible.length > 0 || tags.length > 0 ? (
        <>
          {visible.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm text-text">
              {visible.map((p) => {
                const values = { a: number.format(p.a.mood), b: number.format(p.b.mood) };
                const key = MORE_TEXT[p.id][p.state];
                return (
                  <li key={p.id} data-testid={`insights-more-pattern-${p.id}`} data-state={p.state}>
                    {bars(FREE_LINES.has(p.id) ? ti(key as Parameters<typeof ti>[0], values) : t(key as Parameters<typeof t>[0], values), ti(PATTERN_PAIR[p.id].title), [ti(PATTERN_PAIR[p.id].a), ti(PATTERN_PAIR[p.id].b)], p.a.mood, p.b.mood, `insights-more-pattern-${p.id}-bars`)}
                  </li>
                );
              })}
            </ul>
          )}
          {tagList}
          <p className="mt-3 text-xs text-muted">{ti("patternsFootnote")}</p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted" data-testid="insights-more-patterns-none">
          {t("moreNone")}
        </p>
      )}
      {liftList}
    </section>
  );
}
