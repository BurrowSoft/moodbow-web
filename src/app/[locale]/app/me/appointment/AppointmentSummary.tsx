"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { APPOINTMENT_RULES, checkInCount, firstLine, rangeAverage, starredIn, weeksDays, type StarredEntry, type Weeks } from "@/lib/journal/appointment";
import { CHARTS, METRICS, type InsightRow, type Metric } from "@/lib/journal/insights";
import { segment } from "@/lib/ui/journalLayout";
import { Chart } from "../../insights/Chart";

const RANGE_KEY: Record<Weeks, "range2" | "range4" | "range12"> = { 2: "range2", 4: "range4", 12: "range12" };

// For my appointment (1.2; content/appointment.json): what will print is what's on screen.
// The count, averages and charts, starred entries as date and first line, full text only
// where ticked (none at the start), and the box. Nothing is stored or sent: the ticks and
// the box live in this page's memory only. Never letters, the plan, the toolbox or Bo: the
// page reads check-ins and starred entries, nothing else.
export function AppointmentSummary({ today, rows, starred, dateLabels }: { today: string; rows: InsightRow[]; starred: StarredEntry[]; dateLabels: Record<string, string> }) {
  const t = useTranslations("appointment");
  const ti = useTranslations("insights");
  const tt = useTranslations("today");
  const [weeks, setWeeks] = useState<Weeks>(APPOINTMENT_RULES.defaultWeeks as Weeks);
  const [full, setFull] = useState<Set<string>>(() => new Set());
  const [talk, setTalk] = useState("");
  const oneDecimal = new Intl.NumberFormat(useLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const days = weeksDays(today, weeks);
  const count = checkInCount(rows, days);
  const entries = starredIn(starred, days);
  const valueText = (metric: Metric, v: number) =>
    metric === "mood" || metric === "stress"
      ? ti("chartAverageOfFive", { value: oneDecimal.format(v) })
      : ti("chartAverage", { value: metric === "sleep" ? tt("sleepHours", { hours: oneDecimal.format(v) }) : tt("exerciseMinutes", { minutes: v }) });

  return (
    <div className="space-y-6">
      <p className="text-text print:hidden">{t("intro")}</p>
      <fieldset className="print:hidden">
        <legend className="mb-2 font-medium text-text">{t("show")}</legend>
        <div className="flex flex-wrap gap-2">
          {(APPOINTMENT_RULES.rangeWeeks as Weeks[]).map((w) => (
            <button key={w} type="button" data-testid={`appointment-range-${w}`} aria-pressed={weeks === w} onClick={() => setWeeks(w)} className={segment(weeks === w)}>
              {t(RANGE_KEY[w])}
            </button>
          ))}
        </div>
      </fieldset>

      <section aria-labelledby="appointment-range-title" data-testid="appointment-preview" className="space-y-6">
        <div>
          <h2 id="appointment-range-title" className="text-lg font-medium text-text">
            {t(RANGE_KEY[weeks])}
          </h2>
          <p data-testid="appointment-count" className="text-text">
            {count === 0 ? t("empty") : t("count", { n: count })}
          </p>
        </div>

        {count > 0 && (
          <section aria-labelledby="appointment-averages">
            <h3 id="appointment-averages" className="font-medium text-text">
              {t("averages")}
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
              {METRICS.map((metric) => {
                const chart = CHARTS[metric];
                const { points, average } = rangeAverage(rows, days, metric);
                if (average === null) return null;
                const titleId = `appointment-${metric}`;
                return (
                  <div key={metric} data-testid={`appointment-${metric}`} className="rounded-2xl border border-border p-[12px]">
                    <p id={titleId} className="text-sm font-medium text-text">
                      {ti(chart.title)}
                    </p>
                    <div className="mt-2">
                      <Chart kind={chart.kind} points={points} min={chart.min} max={chart.max} labelledBy={`${titleId} ${titleId}-average`} colourKey={chart.colourKey} gradientId={`appointment-${metric}-gradient`} dots={weeks === 12 ? "isolated" : "all"} />
                    </div>
                    <p id={`${titleId}-average`} data-testid={`appointment-average-${metric}`} className="mt-2 text-sm text-text">
                      {valueText(metric, average)}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {entries.length > 0 && (
          <section aria-labelledby="appointment-starred">
            <h3 id="appointment-starred" className="font-medium text-text">
              {t("starred")}
            </h3>
            <ul className="mt-3 space-y-3">
              {entries.map((e) => {
                const whole = full.has(e.id);
                return (
                  <li key={e.id} data-testid="appointment-entry" className="break-inside-avoid">
                    <p className="text-sm text-muted">{dateLabels[e.entry_date] ?? e.entry_date}</p>
                    <p data-testid="appointment-entry-text" className={`text-text [overflow-wrap:break-word] ${whole ? "whitespace-pre-wrap" : ""}`}>
                      {whole ? e.body : firstLine(e.body)}
                    </p>
                    <label className="mt-1 flex min-h-11 items-center gap-2 text-sm text-text print:hidden">
                      <input
                        type="checkbox"
                        data-testid="appointment-full"
                        checked={whole}
                        onChange={(ev) =>
                          setFull((now) => {
                            const next = new Set(now);
                            if (ev.target.checked) next.add(e.id);
                            else next.delete(e.id);
                            return next;
                          })
                        }
                      />
                      {t("fullText")}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section aria-labelledby="appointment-talk">
          <h3 id="appointment-talk" className="font-medium text-text">
            <label htmlFor="appointment-talk-box">{t("talk")}</label>
          </h3>
          <p id="appointment-talk-hint" className="text-sm text-muted print:hidden">
            {t("talkHint")}
          </p>
          <textarea id="appointment-talk-box" aria-describedby="appointment-talk-hint" value={talk} onChange={(e) => setTalk(e.target.value)} rows={4} data-testid="appointment-talk" className="mt-2 w-full rounded-2xl border border-border bg-surface p-[12px] text-text print:hidden" />
          {/* On paper, the words as typed: a printed box can cut them off. */}
          <p data-testid="appointment-talk-print" className="mt-2 hidden whitespace-pre-wrap text-text print:block">
            {talk}
          </p>
        </section>
      </section>

      <button type="button" data-testid="appointment-print" onClick={() => window.print()} className={`${dialogButton(true)} print:hidden`}>
        {t("print")}
      </button>
      <p data-testid="appointment-footer" className="border-t border-border pt-3 text-sm text-muted">
        {t("footer")}
      </p>
    </div>
  );
}
