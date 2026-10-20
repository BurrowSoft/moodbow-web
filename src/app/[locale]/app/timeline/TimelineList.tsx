"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MomentStar } from "@/components/MomentStar";
import { Link } from "@/i18n/navigation";
import { MOOD_COLOURS, MOOD_DOT_OUTLINE } from "@/lib/journal/checkIn";
import { withOrigin } from "@/lib/journal/origin";
import { dayLabel, groupByMonth, monthLabel, type TimelineDay } from "@/lib/journal/timeline";
import { MonthShare, type MonthCounts } from "./MonthShare";
import { PrintMonthLink } from "./PrintMonthLink";
import { loadTimeline } from "./actions";

// The Timeline (M5, decision 161): days newest first under month headers
// (each with "Share this month" where it can make a card). Each day: its
// mood dot and date with the mood word (a dashed dot without a check-in),
// then its entry previews (2 lines, ★ for moments); the chips live in the
// day and entry views. More days load as the end of the list comes into
// view (by days, not months: a month can span two pages).
// year: the Year card on offer in the month shares (1.1 J, Dec/Jan; UX: the
// same entry points as the app). printable: "Print this month" (1.1 N).
type Props = { initial: TimelineDay[]; initialDone: boolean; momentsOnly: boolean; dateLocaleTag: string; shareable?: boolean; year?: number | null; printable?: boolean };

export function TimelineList({ initial, initialDone, momentsOnly, dateLocaleTag, shareable = false, year = null, printable = false }: Props) {
  const t = useTranslations("timeline");
  const tt = useTranslations("today");
  const te = useTranslations("entry");
  const ta = useTranslations("app");
  const [days, setDays] = useState(initial);
  // The month headers' check-in counts, for this list only (MonthShare).
  const [monthCounts] = useState<MonthCounts>(() => new Map());
  const [done, setDone] = useState(initialDone);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  // How many days the last load added, said in a status region that's
  // always there (new days arrive silently otherwise; a11y pass).
  const [loaded, setLoaded] = useState<number | null>(null);
  // After a load the person asked for (Show more days, Retry), focus goes to
  // the first day it added: the button may be gone (the last page), and
  // focus must never drop to BODY (a11y pass, 1.0). A load from scrolling
  // never moves focus.
  const focusDay = useRef<string | null>(null);
  const asked = useRef(false);
  const joined = useRef(false);
  useEffect(() => {
    const date = focusDay.current;
    if (!date) return;
    focusDay.current = null;
    document.querySelector<HTMLElement>(`[data-testid="timeline-day-${date}"]`)?.focus();
  }, [days]);
  // A failed load the person asked for: the button they pressed is replaced
  // by Retry, so focus goes there.
  const focusRetry = useRef(false);
  useEffect(() => {
    if (!failed || !focusRetry.current) return;
    focusRetry.current = false;
    document.querySelector<HTMLElement>('[data-testid="timeline-retry"]')?.focus();
  }, [failed]);

  const loadMore = useCallback(() => {
    // Read and cleared first, so a skipped call can't pass it to a later
    // load from scrolling.
    const asking = asked.current;
    asked.current = false;
    // Show more days pressed while a load from scrolling is already on its
    // way (focusing the button scrolls it into view, which starts one): that
    // load becomes the person's, so its result takes focus (UX, after #117).
    if (loading && asking) joined.current = true;
    if (done || loading || days.length === 0) return;
    joined.current = false;
    const before = days[days.length - 1].local_date;
    // Empty first, so the same count twice is announced again (reviewer #40).
    setLoaded(null);
    startLoading(async () => {
      // The person's: asked for, joined while on its way, or focus is in the
      // Show more days / Try again area, which the last page takes away.
      const byPerson = () => asking || joined.current || sentinel.current?.contains(document.activeElement) === true;
      try {
        const page = await loadTimeline(before, momentsOnly);
        if (page.status === "error") {
          focusRetry.current = byPerson();
          joined.current = false;
          return setFailed(true);
        }
        setFailed(false);
        // Keyed by date, so a page that overlaps what's shown can't repeat a day.
        const fresh = page.days.filter((d) => !days.some((s) => s.local_date === d.local_date));
        // Nothing new (the end was reached): the last day shown instead.
        if (byPerson()) focusDay.current = fresh[0]?.local_date ?? days[days.length - 1].local_date;
        joined.current = false;
        setDays((shown) => [...shown, ...page.days.filter((d) => !shown.some((s) => s.local_date === d.local_date))]);
        setLoaded(fresh.length);
        setDone(page.done);
      } catch {
        focusRetry.current = byPerson();
        joined.current = false;
        setFailed(true);
      }
    });
  }, [days, done, loading, momentsOnly]);
  const loadByPerson = useCallback(() => {
    asked.current = true;
    loadMore();
  }, [loadMore]);

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
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <h2 id={`month-${month}`} className="text-sm font-medium uppercase tracking-wide text-muted">
              {monthLabel(month, dateLocaleTag)}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4">
              {shareable && <MonthShare month={month} dateLocaleTag={dateLocaleTag} counts={monthCounts} year={year} />}
              {printable && <PrintMonthLink month={month} testId={`timeline-print-${month}`} />}
            </div>
          </div>
          <ul className="mt-3 space-y-3">
            {monthDays.map((day) => {
              const c = day.check_in;
              return (
                <li key={day.local_date} className="rounded-2xl border border-border bg-surface p-4">
                  <Link
                    href={`/app/timeline/${day.local_date}`}
                    data-testid={`timeline-day-${day.local_date}`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg font-medium text-text hover:text-accent"
                  >
                    {/* The mood's dot, named in words beside it (never colour
                        alone); a day without a check-in gets an empty dashed
                        one, said only to screen readers (no guilt). */}
                    {c ? (
                      <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${MOOD_COLOURS[c.mood - 1]} ${MOOD_DOT_OUTLINE}`} aria-hidden="true" data-testid="timeline-mood-dot" />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-dashed border-muted" aria-hidden="true" data-testid="timeline-no-checkin-dot" />
                    )}
                    <span>{dayLabel(day.local_date, dateLocaleTag)}</span>
                    {c ? (
                      <span className="text-sm font-normal text-muted">
                        <span aria-hidden="true">·</span> {tt(`mood${c.mood}` as "mood1")}
                      </span>
                    ) : (
                      <span className="sr-only">{t("dayNoCheckin")}</span>
                    )}
                  </Link>
                  {day.entries.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {day.entries.map((entry) => (
                        <li key={entry.id}>
                          <Link href={withOrigin(`/app/entries/${entry.id}`, "/app/timeline")} data-testid={`timeline-entry-${entry.id}`} className="flex items-start gap-2 rounded-lg text-sm text-text hover:text-accent">
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

      <p role="status" className="sr-only" data-testid="timeline-loaded">
        {loaded ? t("timelineLoadedMore", { count: loaded }) : null}
      </p>
      {!done && (
        <div ref={sentinel} className="flex flex-col items-center gap-3 pb-4" data-testid="timeline-more">
          {failed ? (
            <>
              <p role="alert" className="font-medium text-accent">
                {tt("errGeneric")}
              </p>
              <button type="button" data-testid="timeline-retry" onClick={loadByPerson} className="font-medium text-accent underline underline-offset-4">
                {ta("retry")}
              </button>
            </>
          ) : (
            <>
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none" aria-hidden="true" hidden={!loading} />
              {/* Scrolling loads more by itself; this is for keyboards and
                  screen readers, whose cursor may not scroll the page. */}
              <button type="button" data-testid="timeline-load-more" onClick={loadByPerson} aria-disabled={loading} className="font-medium text-accent underline underline-offset-4 aria-disabled:opacity-60">
                {t("timelineLoadMore")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
