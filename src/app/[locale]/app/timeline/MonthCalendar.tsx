"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { addDays, addMonths, calendarDate, dayNumber, monthGrid, monthOf, weekdayNames, type CalendarMonth } from "@/lib/journal/calendar";
import { MOOD_COLOURS, MOOD_DOT_OUTLINE } from "@/lib/journal/checkIn";
import { formatMonth, MIN_CHECK_INS } from "@/lib/share/moodbow";
import { ShareMonth } from "../insights/ShareMonth";
import { loadCalendarMonth } from "./calendarActions";
import { PrintMonthLink } from "./PrintMonthLink";

// Month calendar (1.1 M, decision 197): one month per screen, weeks from
// Monday. In each day: the dot in its Sunrise mood colour on top, then the
// number, then tiny marks: ★ for a moment and a pencil for writing (Vitor,
// 14 Nov), explained in a key under the grid. A day without a check-in shows
// its number only (no "missed" mark, no guilt). Today is outlined; future days
// are muted and not links. Each cell is named in words (calDayLabel), never
// colour alone, and the grid is one tab stop with arrow keys moving by day.

// The message key for the share link (the share flow translates it).
const SHARE_LABEL = "calShareMonth" as const;

const KEY_STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

type Load = { kind: "ready" } | { kind: "loading" } | { kind: "error" };

export function MonthCalendar({
  today,
  dateLocaleTag,
  initial,
  shareable,
  printable = false,
}: {
  today: string;
  dateLocaleTag: string;
  initial: CalendarMonth | null;
  shareable: boolean;
  printable?: boolean;
}) {
  const t = useTranslations("timeline");
  const tt = useTranslations("today");
  const ta = useTranslations("app");
  const thisMonth = monthOf(today);
  const [month, setMonth] = useState(thisMonth);
  const [months, setMonths] = useState<Map<string, CalendarMonth>>(() => new Map(initial ? [[thisMonth, initial]] : []));
  const [load, setLoad] = useState<Load>(initial ? { kind: "ready" } : { kind: "loading" });
  // The one cell in the tab order (roving tabindex); arrow keys move it.
  const [focus, setFocus] = useState(today);
  const moved = useRef(false);
  const cells = useRef(new Map<string, HTMLAnchorElement>());
  const latest = useRef(0);

  const fetchMonth = (m: string) => {
    const ask = ++latest.current;
    setLoad({ kind: "loading" });
    loadCalendarMonth(m)
      .then((r) => {
        if (latest.current !== ask) return;
        if (r.status !== "ok") return setLoad({ kind: "error" });
        setMonths((prev) => new Map(prev).set(m, r.days));
        setLoad({ kind: "ready" });
      })
      .catch(() => latest.current === ask && setLoad({ kind: "error" }));
  };

  // A month not asked for yet (the first one is the server's).
  useEffect(() => {
    if (months.has(month)) return;
    const timer = window.setTimeout(() => fetchMonth(month), 0);
    return () => window.clearTimeout(timer);
    // Only when the month changes; fetchMonth reads refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // Focus follows the arrow keys (never on first render).
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    cells.current.get(focus)?.focus();
  }, [focus, month]);

  const go = (m: string) => {
    latest.current++;
    setMonth(m);
    setFocus(m === thisMonth ? today : `${m}-01`);
    setLoad(months.has(m) ? { kind: "ready" } : { kind: "loading" });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEP[e.key];
    if (!step) return;
    e.preventDefault();
    const next = addDays(focus, step);
    if (next > today) return;
    moved.current = true;
    if (monthOf(next) !== month) {
      latest.current++;
      setMonth(monthOf(next));
      setLoad(months.has(monthOf(next)) ? { kind: "ready" } : { kind: "loading" });
    }
    setFocus(next);
  };

  const days = months.get(month) ?? {};
  const moods = Object.values(days).filter((d) => d.mood !== null).length;
  const titleId = `calendar-title-${month}`;

  return (
    <section className="mt-6" data-testid="month-calendar">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="calendar-prev"
          onClick={() => go(addMonths(month, -1))}
          aria-label={t("calPrevMonth")}
          title={t("calPrevMonth")}
          className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-text hover:bg-pill"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h2 id={titleId} className="min-w-0 flex-1 text-center text-lg font-medium text-text [overflow-wrap:anywhere]" aria-live="polite" data-testid="calendar-title">
          {formatMonth(month, dateLocaleTag)}
        </h2>
        {/* No months after this one. */}
        <button
          type="button"
          data-testid="calendar-next"
          onClick={() => go(addMonths(month, 1))}
          disabled={month >= thisMonth}
          aria-label={t("calNextMonth")}
          title={t("calNextMonth")}
          className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-text hover:bg-pill disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div role="grid" aria-labelledby={titleId} aria-busy={load.kind === "loading"} onKeyDown={onKeyDown} className="mt-3" data-testid="calendar-grid">
        <div role="row" className="grid grid-cols-7">
          {weekdayNames(dateLocaleTag).map((w) => (
            // The initial on screen, the full name for screen readers (real
            // text, not only a label: axe empty-table-header, Web Tester C7).
            <div key={w.long} role="columnheader" className="py-1 text-center text-xs font-medium text-muted">
              <span aria-hidden="true">{w.short}</span>
              <span className="sr-only">{w.long}</span>
            </div>
          ))}
        </div>
        {monthGrid(month).map((week, i) => (
          <div key={i} role="row" className="grid grid-cols-7">
            {week.map((date, j) => {
              if (!date) return <div key={j} role="gridcell" />;
              const day = days[date];
              const future = date > today;
              const marks = (
                <>
                  {/* The same height with or without a dot, so the numbers line up. */}
                  <span className="flex h-2.5 items-center" aria-hidden="true">
                    {day?.mood != null && <span className={`h-2.5 w-2.5 rounded-full ${MOOD_COLOURS[day.mood - 1]} ${MOOD_DOT_OUTLINE}`} data-testid="calendar-dot" />}
                  </span>
                  <span>{dayNumber(date, dateLocaleTag)}</span>
                  <span className="flex h-[9px] items-center gap-0.5" aria-hidden="true">
                    {day?.moment && <MomentIcon testId="calendar-moment" />}
                    {day?.entry && <PencilIcon testId="calendar-entry" />}
                  </span>
                </>
              );
              const cell = "flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-xl text-sm";
              return (
                <div key={date} role="gridcell" className="p-0.5" aria-current={date === today ? "date" : undefined}>
                  {future ? (
                    // Muted by the token colour, not opacity, so the number
                    // keeps its contrast (axe color-contrast, Web Tester C7).
                    <span className={`${cell} text-muted`} data-testid={`calendar-day-${date}`}>
                      {marks}
                    </span>
                  ) : (
                    <Link
                      href={`/app/timeline/${date}`}
                      ref={(el: HTMLAnchorElement | null) => {
                        if (el) cells.current.set(date, el);
                        else cells.current.delete(date);
                      }}
                      tabIndex={date === focus ? 0 : -1}
                      onFocus={() => setFocus(date)}
                      data-testid={`calendar-day-${date}`}
                      aria-label={t("calDayLabel", {
                        date: calendarDate(date, dateLocaleTag),
                        mood: day?.mood != null ? tt(`mood${day.mood}` as "mood1") : "none",
                        moment: day?.moment ? "yes" : "no",
                        entry: day?.entry ? "yes" : "no",
                      })}
                      className={`${cell} text-text hover:bg-pill ${date === today ? "outline outline-1 outline-text" : ""}`}
                    >
                      {marks}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* The key for the tiny marks (the day's own name says them in words too). */}
      <ul aria-label={t("calKey")} data-testid="calendar-key" className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
        <li className="inline-flex items-center gap-1">
          <PencilIcon />
          {t("calKeyWriting")}
        </li>
        <li className="inline-flex items-center gap-1">
          <MomentIcon />
          {t("calKeyMoment")}
        </li>
      </ul>

      {load.kind === "error" && (
        <div role="alert" className="mt-3" data-testid="calendar-error">
          <p className="text-sm text-text">{tt("errGeneric")}</p>
          <button
            type="button"
            data-testid="calendar-retry"
            onClick={() => fetchMonth(month)}
            className="mt-2 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium text-text hover:bg-pill"
          >
            {ta("tryAgain")}
          </button>
        </div>
      )}

      {/* The existing share flow on this month's moodbow card, when the month
          has enough check-ins for one (as in the Timeline list), and Print
          this month (1.1 N, §N: "under the calendar"). */}
      {((shareable && load.kind === "ready" && moods >= MIN_CHECK_INS) || printable) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4">
          {shareable && load.kind === "ready" && moods >= MIN_CHECK_INS && (
            <ShareMonth month={month} dateLocaleTag={dateLocaleTag} label={SHARE_LABEL} asLink testId="calendar-share" />
          )}
          {printable && <PrintMonthLink month={month} testId="calendar-print" />}
        </div>
      )}
    </section>
  );
}

// The tiny marks, ~9 px: a pencil in text ink for writing, the star for a moment. Decorative here
// (aria-hidden); the day's name and the key say them in words.
function PencilIcon({ testId }: { testId?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="9" height="9" aria-hidden="true" data-testid={testId} className="shrink-0 text-text" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20l4-1 11-11-3-3L5 16z" />
    </svg>
  );
}
function MomentIcon({ testId }: { testId?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="9" height="9" aria-hidden="true" data-testid={testId} className="shrink-0 fill-accent">
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
    </svg>
  );
}
