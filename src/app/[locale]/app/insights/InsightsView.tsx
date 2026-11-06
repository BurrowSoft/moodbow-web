import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { METRICS, summarize, type InsightRow, type Metric, type Range } from "@/lib/journal/insights";
import type { Pattern, PatternId } from "@/lib/journal/patterns";
import type { ValueKey } from "@/lib/journal/valueColours";
import { segment } from "@/lib/ui/journalLayout";
import { Chart } from "./Chart";

const RANGE_TABS: { range: Range; key: "rangeWeek" | "rangeMonth" | "range3Months" }[] = [
  { range: "week", key: "rangeWeek" },
  { range: "month", key: "rangeMonth" },
  { range: "3months", key: "range3Months" },
];
const CHARTS: Record<Metric, { title: "chartMood" | "chartSleep" | "chartStress" | "chartExercise"; kind: "line" | "bars"; min: number; max: number; colourKey: ValueKey }> = {
  mood: { title: "chartMood", kind: "line", min: 1, max: 5, colourKey: "mood" },
  sleep: { title: "chartSleep", kind: "bars", min: 0, max: 12, colourKey: "sleep_hours" },
  stress: { title: "chartStress", kind: "line", min: 1, max: 5, colourKey: "stress" },
  exercise: { title: "chartExercise", kind: "bars", min: 0, max: 90, colourKey: "exercise_minutes" },
};
// Too few days: how many more, per chart (#9765 S-02, the same as the app).
const NEED_MORE: Record<Metric, "insightsNeedMore" | "insightsNeedMoreSleep" | "insightsNeedMoreStress" | "insightsNeedMoreMovement"> = {
  mood: "insightsNeedMore",
  sleep: "insightsNeedMoreSleep",
  stress: "insightsNeedMoreStress",
  exercise: "insightsNeedMoreMovement",
};
// Each pattern's sentence: two numbers ("shown"), or "about the same".
const PATTERN_TEXT: Record<PatternId, Record<"shown" | "same", `patterns${"Sleep" | "Movement" | "Stress"}${"Shown" | "Same"}`>> = {
  sleep: { shown: "patternsSleepShown", same: "patternsSleepSame" },
  movement: { shown: "patternsMovementShown", same: "patternsMovementSame" },
  stress: { shown: "patternsStressShown", same: "patternsStressSame" },
};

// The Insights screen for loaded check-ins: range tabs, then one card per
// chart with its average and the change vs the range before. The change is
// neutral on purpose (decision 98): "stress ↑" isn't good, "mood ↓" isn't a
// failure, so it gets the same muted ink either way.
// share: the "My month's moodbow" button, where share cards are on (M10).
// week: "Your week" (1.1 D), between the range tabs and the charts, where AI
// and the weekly report are on.
// patterns: Patterns (no AI), after the charts, where patterns-live is on;
// the same on every tab (a fixed 90 days).
export function InsightsView({
  rows,
  today,
  range,
  share,
  week,
  patterns,
}: {
  rows: InsightRow[];
  today: string;
  range: Range;
  share?: React.ReactNode;
  week?: React.ReactNode;
  patterns?: Pattern[];
}) {
  const t = useTranslations("insights");
  const tt = useTranslations("today");
  // Always one decimal for mood, stress and sleep ("4.0", "↑ 1.0": the
  // precision stays visible), whole minutes for exercise; same as the app.
  const oneDecimal = new Intl.NumberFormat(useLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // A value with its unit: "7.0 h", "35 min", or the bare number (1–5).
  const withUnit = (metric: Metric, v: number) =>
    metric === "sleep"
      ? tt("sleepHours", { hours: oneDecimal.format(v) })
      : metric === "exercise"
        ? tt("exerciseMinutes", { minutes: v })
        : oneDecimal.format(v);
  const number = oneDecimal;
  const tab = segment;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="min-w-0 text-3xl font-medium tracking-tight [overflow-wrap:anywhere]">{t("insightsTitle")}</h1>
        {share}
      </div>
      <nav aria-label={t("insightsTitle")} className="mt-4 flex flex-wrap gap-2">
        {RANGE_TABS.map(({ range: r, key }) => (
          <Link
            key={r}
            href={r === "week" ? "/app/insights" : `/app/insights?range=${r}`}
            data-testid={`insights-range-${r}`}
            aria-current={r === range ? "page" : undefined}
            className={tab(r === range)}
          >
            {t(key)}
          </Link>
        ))}
      </nav>

      {week}

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {METRICS.map((metric) => {
          const chart = CHARTS[metric];
          const s = summarize(rows, today, range, metric);
          const titleId = `chart-${metric}-title`;
          const summaryId = `chart-${metric}-summary`;
          return (
            <section key={metric} data-testid={`insights-chart-${metric}`} className="rounded-3xl border border-border bg-surface p-5" aria-labelledby={titleId}>
              <h2 id={titleId} className="text-lg font-medium text-text">
                {t(chart.title)}
              </h2>
              {s.enough && s.average !== null ? (
                <>
                  <div className="mt-3">
                    <Chart kind={chart.kind} points={s.points} min={chart.min} max={chart.max} labelledBy={`${titleId} ${summaryId}`} colourKey={chart.colourKey} gradientId={`chart-${metric}-gradient`} dots={range === "3months" ? "isolated" : "all"} />
                  </div>
                  <div id={summaryId} className="mt-3 space-y-1 text-sm">
                    <p className="font-medium text-text" data-testid={`insights-average-${metric}`}>
                      {metric === "mood" || metric === "stress"
                        ? t("chartAverageOfFive", { value: number.format(s.average) })
                        : t("chartAverage", { value: withUnit(metric, s.average) })}
                    </p>
                    {s.change !== null && (
                      <p className="text-muted" data-testid={`insights-change-${metric}`}>
                        {s.change === 0
                          ? t("chartNoChange", { range })
                          : t(s.change > 0 ? "chartChangeUp" : "chartChangeDown", { value: withUnit(metric, Math.abs(s.change)), range })}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted" data-testid={`insights-not-enough-${metric}`}>
                  {t(NEED_MORE[metric], { count: s.missing })}
                </p>
              )}
            </section>
          );
        })}
      </div>

      {patterns && <Patterns patterns={patterns} format={(v) => number.format(v)} />}
    </section>
  );
}

// Patterns (no AI): the shown and "about the same" sentences in their fixed
// order (sleep, movement, stress), never sorted by size; a pattern without
// enough days is left out; nothing to show is one line. Descriptive, never
// causal: the footnote says so under the sentences.
function Patterns({ patterns, format }: { patterns: Pattern[]; format: (v: number) => string }) {
  const t = useTranslations("insights");
  const visible = patterns.filter((p) => p.state !== "not_enough");
  return (
    <section data-testid="insights-patterns" aria-labelledby="patterns-title" className="mt-6 rounded-3xl border border-border bg-surface p-5">
      <h2 id="patterns-title" className="text-lg font-medium text-text">
        {t("patternsTitle")}
      </h2>
      <p className="text-sm text-muted">{t("patternsSubtitle")}</p>
      {visible.length > 0 ? (
        <>
          <ul className="mt-3 space-y-2 text-sm text-text">
            {visible.map((p) => (
              <li key={p.id} data-testid={`insights-pattern-${p.id}`} data-state={p.state}>
                {t(PATTERN_TEXT[p.id][p.state], { a: format(p.a.mood), b: format(p.b.mood) })}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted" data-testid="insights-patterns-footnote">
            {t("patternsFootnote")}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted" data-testid="insights-patterns-none">
          {t("patternsNone")}
        </p>
      )}
    </section>
  );
}
