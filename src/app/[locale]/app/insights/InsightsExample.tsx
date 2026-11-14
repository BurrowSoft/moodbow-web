"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { valueHex } from "@/lib/journal/valueColours";
import { EXAMPLE_RANGES, INSIGHTS_EXAMPLE, WEEK_EXAMPLE, type ExampleCard, type ExampleRange } from "@/lib/plus/insightsExample";
import { MoodPair } from "@/components/MoodPair";
import { PATTERN_PAIR } from "@/lib/journal/patternPair";
import { JOURNAL_CARD, JOURNAL_HEADING, segment } from "@/lib/ui/journalLayout";

// Insights for someone without Plus (spec "Insights become Plus" and its rulings, 14 Nov): an
// EXAMPLE, clearly labelled, from a static fixture (never their data). The range chips switch
// the example; everything else in the sample area is ONE link to the Plus screen, named by the
// strip and See Plus, so a screen reader never reads the sample numbers as theirs (ruling 3). The
// tab bar, Back and help stay usable (help is passed in, beside the title). A diagonal "EXAMPLE"
// sits behind it all, whole at every width (an SVG that scales to fit), aria-hidden.
const RANGE_LABEL: Record<ExampleRange, [ns: "insights" | "plus", key: string]> = {
  week: ["insights", "rangeWeek"],
  month: ["insights", "rangeMonth"],
  "3months": ["insights", "range3Months"],
  year: ["plus", "tabYear"],
};
const TITLE: Record<ExampleCard["metric"], string> = { mood: "chartMood", sleep_hours: "chartSleep", stress: "chartStress", exercise_minutes: "chartExercise" };

export function InsightsExample({ help }: { help: React.ReactNode }) {
  const t = useTranslations("insights");
  const tp = useTranslations("plus");
  const locale = useLocale();
  const [range, setRange] = useState<ExampleRange>("week");
  // Hours and minutes in the page's language, from the browser's own unit names.
  const unit = (value: number, u: "hour" | "minute") => new Intl.NumberFormat(locale === "pt-br" ? "pt-BR" : locale, { style: "unit", unit: u, unitDisplay: "short", maximumFractionDigits: 1 }).format(value);
  const label = (r: ExampleRange) => (RANGE_LABEL[r][0] === "plus" ? tp(RANGE_LABEL[r][1]) : t(RANGE_LABEL[r][1]));
  const average = (c: ExampleCard) =>
    c.metric === "mood" || c.metric === "stress" ? t("chartAverageOfFive", { value: c.average.toFixed(1) }) : t("chartAverage", { value: unit(c.average, c.metric === "sleep_hours" ? "hour" : "minute") });
  const change = (c: ExampleCard) => `${c.change > 0 ? "+" : c.change < 0 ? "−" : ""}${Math.abs(c.change)}`;

  return (
    <section data-testid="insights-example" className="relative isolate space-y-4">
      <svg data-testid="insights-example-watermark" aria-hidden="true" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-text opacity-[0.06]">
        <text x="500" y="500" textAnchor="middle" dominantBaseline="central" transform="rotate(-58 500 500)" fontSize="150" fontWeight="700" textLength="880" lengthAdjust="spacingAndGlyphs" fill="currentColor">
          {tp("exampleWatermark")}
        </text>
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-x-[12px] gap-y-[8px]">
        <h1 className={JOURNAL_HEADING}>{t("insightsTitle")}</h1>
        {help}
      </div>
      {/* The dark strip with the gold See Plus, first (board 3 v58), in every theme. */}
      <div data-testid="insights-example-strip" className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#2B2438] px-[16px] py-[12px] text-white">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F2C66D" strokeWidth="2" strokeLinecap="round" className="shrink-0">
          <path d="M3 18a9 9 0 0 1 18 0" />
          <path d="M6.5 18a5.5 5.5 0 0 1 11 0" />
          <path d="M10 18a2 2 0 0 1 4 0" />
        </svg>
        <p className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{tp("exampleStrip")}</p>
        <Link href="/app/me/plus" data-testid="insights-example-see" className="inline-flex min-h-11 items-center font-medium text-[#F2C66D] underline underline-offset-4">
          {tp("seePlus")}
        </Link>
      </div>
      <div role="group" aria-label={tp("exampleRanges")} className="flex flex-wrap gap-2">
        {EXAMPLE_RANGES.map((r) => (
          <button key={r} type="button" aria-pressed={range === r} data-testid={`insights-example-range-${r}`} onClick={() => setRange(r)} className={segment(range === r)}>
            {label(r)}
          </button>
        ))}
      </div>
      <Link href="/app/me/plus" data-testid="insights-example-sample" aria-label={tp("exampleSample", { strip: tp("exampleStrip"), see: tp("seePlus") })} className="block space-y-3 rounded-3xl no-underline">
        <div aria-hidden="true" className="space-y-3">
          {range === "week" ? (
            <WeekExample />
          ) : INSIGHTS_EXAMPLE[range].map((c) => (
            <span key={c.metric} data-testid={`insights-example-${c.metric}`} className={`block min-w-0 [overflow-wrap:anywhere] ${JOURNAL_CARD}`}>
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0 font-medium text-text">{t(TITLE[c.metric])}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-sm text-text">{change(c)}</span>
              </span>
              <span className="mt-1 block text-sm text-muted">{average(c)}</span>
              <span className="mt-3 flex h-16 items-end gap-1">
                {c.bars.map((v, i) => {
                  const max = c.metric === "exercise_minutes" ? 60 : c.metric === "sleep_hours" ? 10 : 5;
                  return (
                    <span
                      key={i}
                      className="min-w-0 flex-1 rounded-t border border-muted"
                      style={{ height: `${Math.max(8, (v / max) * 100)}%`, backgroundColor: valueHex(c.metric, v) ?? "transparent" }}
                    />
                  );
                })}
              </span>
            </span>
          ))}
        </div>
      </Link>
    </section>
  );
}

// Week (board 3): Your week (7 bars in the mood palette, one sentence), then What lifts me and
// Patterns as #301's colour-bar pairs. Inside the sample's aria-hidden area, like the cards.
function WeekExample() {
  const t = useTranslations("insights");
  const tp = useTranslations("plus");
  const locale = useLocale();
  const one = new Intl.NumberFormat(locale === "pt-br" ? "pt-BR" : locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const signed = new Intl.NumberFormat(locale === "pt-br" ? "pt-BR" : locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const fmt = (v: number) => one.format(v);
  const sgn = (v: number) => signed.format(v);
  const sleep = PATTERN_PAIR.sleep;
  return (
    <>
      <div data-testid="insights-example-week" className={`min-w-0 [overflow-wrap:anywhere] ${JOURNAL_CARD}`}>
        {/* Wraps at large text (300 % on a 320 px phone: the label went 9 px past the edge). */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="min-w-0 font-medium text-text">{t("yourWeekTitle")}</span>
          <span className="text-xs text-muted">{tp("exampleLabel")}</span>
        </div>
        <div className="mt-3 flex h-24 items-end gap-2">
          {WEEK_EXAMPLE.days.map((v, i) => (
            <span key={i} className="min-w-0 flex-1 rounded-lg" style={{ height: `${Math.max(10, (v / 5) * 100)}%`, backgroundColor: valueHex("mood", v) ?? "transparent" }} />
          ))}
        </div>
        <p className="mt-3 text-sm text-text">{tp("exampleWeekLine")}</p>
      </div>
      <div data-testid="insights-example-lifts" className={`min-w-0 [overflow-wrap:anywhere] ${JOURNAL_CARD}`}>
        <span className="font-medium text-text">{tp("liftsTitle")}</span>
        <div className="mt-2 space-y-4">
          {WEEK_EXAMPLE.lifts.map((l) => {
            const tag = tp(l.tag);
            return (
              <MoodPair
                key={l.tag}
                sentence={tp("liftsRow", { tag, a: fmt(l.a), b: fmt(l.b) })}
                title={t("pairTag", { tag })}
                labels={[t("pairWith", { tag }), t("pairOther")]}
                a={l.a}
                b={l.b}
                format={fmt}
                signed={sgn}
              />
            );
          })}
        </div>
      </div>
      <div data-testid="insights-example-patterns" className={`min-w-0 [overflow-wrap:anywhere] ${JOURNAL_CARD}`}>
        <span className="font-medium text-text">{t("patternsTitle")}</span>
        <MoodPair
          sentence={t("patternsSleepShown", { a: fmt(WEEK_EXAMPLE.sleep.a), b: fmt(WEEK_EXAMPLE.sleep.b) })}
          title={t(sleep.title)}
          labels={[t(sleep.a), t(sleep.b)]}
          a={WEEK_EXAMPLE.sleep.a}
          b={WEEK_EXAMPLE.sleep.b}
          format={fmt}
          signed={sgn}
        />
      </div>
    </>
  );
}
