"use client";

import { useState, type ReactNode } from "react";
import { MOOD_HEX } from "@/lib/share/moodbow";

// The shared-week viewer (1.4 G; plans/PLAN-trusted-share.md §4; board 28b with UX's copy, 18 Nov).
// - Nothing is fetched until "Show the week" is tapped (UX, the Reviewer's item 7), so link
//   scanners and previews never load the data or count as a view.
// - The token is read from the URL fragment, sent only in a POST body, and the fragment is then
//   cleared from the address bar. It's never in a URL we request, a log or an analytics hit.
// - The first fetch is week 0 (a view, counted by share_view); the arrows fetch weeks 1-3. A week
//   before the link's creation resolves to week 0, so a repeated week_start means no earlier week.
// - Never text: mood colours, the count and the chosen Routine percents only.
export type SharedWeekStrings = {
  titleBefore: string;
  introBefore: string;
  show: string;
  titleNamed: string; // with {name}
  titleAnon: string;
  weekOf: string; // with {date}
  checkIns: string[]; // index 0..7, already in the right plural
  routinePercent: string; // with {name} and {percent}
  routineNotEnough: string; // with {name}
  earlier: string;
  later: string;
  none: string;
  unavailable: string;
  loading: string;
  dayNone: string; // with {day}
  moods: string[]; // mood 1..5 labels, index 0..4
};
type Week = { first_name: string | null; week_start: string; days: { date: string; mood: number | null }[]; check_ins: number; routine?: { name: string; percent: number | null }[]; weeks_available?: number };

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");

function readToken(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  return hash === "" ? null : hash;
}

export function SharedWeekView({ strings, locale, help, footer }: { strings: SharedWeekStrings; locale: string; help: ReactNode; footer: ReactNode }) {
  const [state, setState] = useState<"before" | "loading" | "ok" | "unavailable">("before");
  const [week, setWeek] = useState<Week | null>(null);
  const [index, setIndex] = useState(0);
  const [noEarlier, setNoEarlier] = useState(false);
  // Week 0's start: an arrow's answer with this start means that earlier week doesn't exist (it's
  // before the link's creation), so share_view gave week 0 back.
  const [week0Start, setWeek0Start] = useState<string | null>(null);
  // The token, kept in memory once read; the fragment is cleared from the address bar.
  const [token, setToken] = useState<string | null>(null);

  const load = async (to: number, known: string | null) => {
    const t = known ?? token;
    if (!t) return setState("unavailable");
    setState("loading");
    try {
      const res = await fetch("/api/share/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t, week: to }), cache: "no-store" });
      const body = (await res.json()) as { status?: string } & Partial<Week>;
      if (!res.ok || body.status !== "ok") return setState("unavailable");
      // Asked for an earlier week and got week 0 back: there's no earlier week to show.
      if (to > 0 && body.week_start === week0Start) {
        setNoEarlier(true);
        return setState("ok");
      }
      if (to === 0) setWeek0Start(body.week_start ?? null);
      setWeek(body as Week);
      setIndex(to);
      setState("ok");
    } catch {
      setState("unavailable");
    }
  };

  const start = () => {
    const t = readToken();
    if (typeof window !== "undefined" && window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setToken(t);
    void load(0, t);
  };

  const dayFormat = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const dayLong = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" });
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const heading = week ? (week.first_name ? fill(strings.titleNamed, { name: week.first_name }) : strings.titleAnon) : strings.titleBefore;

  return (
    <div className="space-y-5">
      <h1 data-testid="shared-title" className="text-2xl leading-tight font-semibold text-text [overflow-wrap:anywhere]">
        {heading}
      </h1>
      {state === "before" && (
        <div className="space-y-4 rounded-3xl bg-surface px-[18px] py-[18px]">
          <p className="text-[15px] leading-normal text-muted">{strings.introBefore}</p>
          <button type="button" data-testid="shared-show" onClick={start} className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-accent px-[20px] font-medium text-on-accent hover:bg-accent-hover">
            {strings.show}
          </button>
        </div>
      )}
      <p role="status" className="sr-only">
        {state === "loading" ? strings.loading : ""}
      </p>
      {state === "unavailable" && (
        <p data-testid="shared-unavailable" className="rounded-3xl bg-surface px-[18px] py-[18px] text-text">
          {strings.unavailable}
        </p>
      )}
      {week && state !== "unavailable" && (
        <section aria-labelledby="shared-week-title" data-testid="shared-week" className="space-y-4 rounded-3xl bg-surface px-[18px] py-[18px]">
          <h2 id="shared-week-title" className="text-base font-semibold text-text">
            {fill(strings.weekOf, { date: dateFormat.format(at(week.week_start)) })}
          </h2>
          <ol className="grid grid-cols-7 gap-[6px]" data-testid="shared-days">
            {week.days.map((d) => (
              <li key={d.date} className="flex flex-col items-center gap-[4px]">
                <span aria-hidden="true" className="text-xs text-muted">
                  {dayFormat.format(at(d.date))}
                </span>
                <span
                  aria-hidden="true"
                  className={`block h-[32px] w-full rounded-lg ${d.mood === null ? "border border-dashed border-border" : ""}`}
                  style={d.mood === null ? undefined : { backgroundColor: MOOD_HEX[d.mood - 1] }}
                />
                <span className="sr-only">{d.mood === null ? fill(strings.dayNone, { day: dayLong.format(at(d.date)) }) : `${dayLong.format(at(d.date))}: ${strings.moods[d.mood - 1]}`}</span>
              </li>
            ))}
          </ol>
          <p data-testid="shared-count" className="text-text">
            {week.check_ins === 0 ? strings.none : strings.checkIns[Math.min(week.check_ins, 7)]}
          </p>
          {week.routine && week.routine.length > 0 && (
            <ul className="space-y-1 text-text [overflow-wrap:anywhere]" data-testid="shared-routine">
              {week.routine.map((r, i) => (
                <li key={i}>{r.percent === null ? fill(strings.routineNotEnough, { name: r.name }) : fill(strings.routinePercent, { name: r.name, percent: String(r.percent) })}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-between gap-3">
            <button type="button" data-testid="shared-earlier" disabled={index >= (week.weeks_available ?? 3) || noEarlier || state === "loading"} onClick={() => void load(index + 1, null)} className="inline-flex min-h-[44px] items-center rounded-full border border-border px-[16px] font-medium text-text disabled:opacity-40">
              {strings.earlier}
            </button>
            <button
              type="button"
              data-testid="shared-later"
              disabled={index === 0 || state === "loading"}
              onClick={() => {
                setNoEarlier(false);
                void load(index - 1, null);
              }}
              className="inline-flex min-h-[44px] items-center rounded-full border border-border px-[16px] font-medium text-text disabled:opacity-40"
            >
              {strings.later}
            </button>
          </div>
        </section>
      )}
      <p className="text-sm leading-normal text-muted">{help}</p>
      <p className="text-xs leading-normal text-muted">{footer}</p>
    </div>
  );
}
