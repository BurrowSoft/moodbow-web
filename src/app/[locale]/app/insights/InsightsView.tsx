import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { METRICS, summarize, type InsightRow, type Metric, type Range } from "@/lib/journal/insights";
import { Chart } from "./Chart";

const RANGE_TABS: { range: Range; key: "rangeWeek" | "rangeMonth" | "range3Months" }[] = [
  { range: "week", key: "rangeWeek" },
  { range: "month", key: "rangeMonth" },
  { range: "3months", key: "range3Months" },
];
const CHARTS: Record<Metric, { title: "chartMood" | "chartSleep" | "chartStress" | "chartExercise"; kind: "line" | "bars"; min: number; max: number }> = {
  mood: { title: "chartMood", kind: "line", min: 1, max: 5 },
  sleep: { title: "chartSleep", kind: "bars", min: 0, max: 12 },
  stress: { title: "chartStress", kind: "line", min: 1, max: 5 },
  exercise: { title: "chartExercise", kind: "bars", min: 0, max: 90 },
};

// The Insights screen for loaded check-ins: range tabs, then one card per
// chart with its average and the change vs the range before. The change is
// neutral on purpose (decision 98): "stress ↑" isn't good, "mood ↓" isn't a
// failure, so it gets the same muted ink either way.
// share: the "My month's moodbow" button, where share cards are on (M10).
export function InsightsView({ rows, today, range, share }: { rows: InsightRow[]; today: string; range: Range; share?: React.ReactNode }) {
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
  const tab = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${active ? "bg-pill text-accent" : "text-muted hover:bg-pill"}`;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-medium tracking-tight">{t("insightsTitle")}</h1>
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
                    <Chart kind={chart.kind} points={s.points} min={chart.min} max={chart.max} labelledBy={`${titleId} ${summaryId}`} neutral={metric === "mood"} />
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
                  {t("chartNotEnough")}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
