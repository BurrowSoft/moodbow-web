"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MomentStar } from "@/components/MomentStar";
import { Link } from "@/i18n/navigation";
import { MOOD_COLOURS } from "@/lib/journal/checkIn";
import { dayLabel, groupByMonth, monthLabel, type TimelineDay } from "@/lib/journal/timeline";
import { loadTimeline } from "./actions";

// The Timeline (M5): days newest first under month headers. Each day: its
// date and mood (colour dot + label), check-in chips, then its entry
// previews (2 lines, ★ for moments). More days load as the end of the list
// comes into view (by days, not months: a month can span two pages).
type Props = { initial: TimelineDay[]; initialDone: boolean; momentsOnly: boolean; dateLocaleTag: string };

export function TimelineList({ initial, initialDone, momentsOnly, dateLocaleTag }: Props) {
  const t = useTranslations("timeline");
  const tt = useTranslations("today");
  const te = useTranslations("entry");
  const ta = useTranslations("app");
  const [days, setDays] = useState(initial);
  const [done, setDone] = useState(initialDone);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(() => {
    if (done || loading || days.length === 0) return;
    const before = days[days.length - 1].local_date;
    startLoading(async () => {
      try {
        const page = await loadTimeline(before, momentsOnly);
        if (page.status === "error") return setFailed(true);
        setFailed(false);
        // Keyed by date, so a page that overlaps what's shown can't repeat a day.
        setDays((shown) => [...shown, ...page.days.filter((d) => !shown.some((s) => s.local_date === d.local_date))]);
        setDone(page.done);
      } catch {
        setFailed(true);
      }
    });
  }, [days, done, loading, momentsOnly]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || failed || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((seen) => seen.some((e) => e.isIntersecting) && loadMore(), { rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, done, failed]);

  if (days.length === 0) {
    return momentsOnly ? (
      <p className="mt-10 text-muted" data-testid="timeline-empty">
        {t("timelineMomentsEmpty")}
      </p>
    ) : (
      <div className="mt-10" data-testid="timeline-empty">
        <h2 className="text-xl font-medium text-text">{t("timelineEmptyTitle")}</h2>
        <p className="mt-2 text-muted">{t("timelineEmptyBody")}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-10">
      {groupByMonth(days).map(({ month, days: monthDays }) => (
        <section key={month} aria-labelledby={`month-${month}`}>
          <h2 id={`month-${month}`} className="text-sm font-medium uppercase tracking-wide text-muted">
            {monthLabel(month, dateLocaleTag)}
          </h2>
          <ul className="mt-3 space-y-3">
            {monthDays.map((day) => {
              const c = day.check_in;
              const chips = c
                ? [
                    c.sleep_hours != null ? tt("sleepHours", { hours: Number(c.sleep_hours) }) : null,
                    c.exercise_minutes != null
                      ? c.exercise_minutes === 0
                        ? tt("exerciseNone")
                        : c.exercise_minutes === 90
                          ? tt("exercise90")
                          : tt("exerciseMinutes", { minutes: c.exercise_minutes })
                      : null,
                    c.stress != null ? tt("stressChip", { level: c.stress }) : null,
                  ].filter((x): x is string => x !== null)
                : [];
              return (
                <li key={day.local_date} className="rounded-2xl border border-border bg-surface p-4">
                  <Link
                    href={`/app/timeline/${day.local_date}`}
                    data-testid={`timeline-day-${day.local_date}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg font-medium text-text hover:text-accent"
                  >
                    <span>{dayLabel(day.local_date, dateLocaleTag)}</span>
                    {c && (
                      <span className="flex items-center gap-2 text-sm text-muted">
                        <span className={`h-3 w-3 rounded-full ${MOOD_COLOURS[c.mood - 1]}`} aria-hidden="true" />
                        {tt(`mood${c.mood}` as "mood1")}
                      </span>
                    )}
                  </Link>
                  {chips.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {chips.map((chip) => (
                        <li key={chip} className="rounded-full bg-pill px-3 py-0.5 text-xs text-text">
                          {chip}
                        </li>
                      ))}
                    </ul>
                  )}
                  {day.entries.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {day.entries.map((entry) => (
                        <li key={entry.id}>
                          <Link href={`/app/entries/${entry.id}`} data-testid={`timeline-entry-${entry.id}`} className="flex items-start gap-2 rounded-lg text-sm text-text hover:text-accent">
                            {entry.is_moment && <MomentStar label={te("momentBadge")} />}
                            <span className="line-clamp-2 whitespace-pre-line">{entry.preview}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {!done && (
        <div ref={sentinel} className="flex flex-col items-center gap-3 pb-4" data-testid="timeline-more" aria-busy={loading}>
          {failed ? (
            <>
              <p role="alert" className="font-medium text-accent">
                {tt("errGeneric")}
              </p>
              <button type="button" data-testid="timeline-retry" onClick={loadMore} className="font-medium text-accent underline underline-offset-4">
                {ta("retry")}
              </button>
            </>
          ) : (
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none" aria-hidden="true" hidden={!loading} />
          )}
        </div>
      )}
    </div>
  );
}
