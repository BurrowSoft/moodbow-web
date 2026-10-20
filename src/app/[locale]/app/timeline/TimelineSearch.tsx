"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { MomentStar } from "@/components/MomentStar";
import { Link } from "@/i18n/navigation";
import { MOOD_COLOURS, MOOD_DOT_OUTLINE } from "@/lib/journal/checkIn";
import { withOrigin } from "@/lib/journal/origin";
import { SEARCH_DEBOUNCE_MS, searchTerm } from "@/lib/journal/search";
import { dayLabel } from "@/lib/journal/timeline";
import { searchEntries, type SearchHit } from "./searchActions";

// Search your journal (1.1 L, decision 195): a magnifier at the top of the
// Timeline opens a search field; while it's open the results replace the
// list, and Esc or ✕ closes it and brings the list back. Debounced, from 2
// characters. The text stays in this component: never in the URL, storage
// or any log, and nothing is remembered ("no recent searches").

type State = { kind: "idle" } | { kind: "searching" } | { kind: "results"; q: string; hits: SearchHit[]; more: boolean } | { kind: "error"; q: string; offline: boolean };

export function TimelineSearch({ dateLocaleTag, children }: { dateLocaleTag: string; children: ReactNode }) {
  const t = useTranslations("timeline");
  const tt = useTranslations("today");
  const te = useTranslations("entry");
  const ta = useTranslations("app");
  const tai = useTranslations("ai");
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const opener = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  // Only the latest request's answer counts.
  const latest = useRef(0);

  const run = (q: string) => {
    const ask = ++latest.current;
    setState({ kind: "searching" });
    const failed = () => latest.current === ask && setState({ kind: "error", q, offline: !navigator.onLine });
    searchEntries(q)
      .then((r) => {
        if (latest.current !== ask) return;
        if (r.status === "ok") setState({ kind: "results", q, hits: r.hits, more: r.more });
        else failed();
      })
      .catch(failed);
  };

  useEffect(() => {
    if (!open) return;
    const q = searchTerm(text);
    const ask = ++latest.current;
    if (!q) {
      const reset = window.setTimeout(() => latest.current === ask && setState({ kind: "idle" }), 0);
      return () => window.clearTimeout(reset);
    }
    const timer = window.setTimeout(() => run(q), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text, open]);

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  const close = () => {
    latest.current++;
    setOpen(false);
    setText("");
    setState({ kind: "idle" });
    // Back to the magnifier, once it's rendered again.
    window.setTimeout(() => opener.current?.focus(), 0);
  };

  if (!open)
    return (
      <>
        <div className="mt-4 flex justify-end">
          <button
            ref={opener}
            type="button"
            data-testid="timeline-search-open"
            onClick={() => setOpen(true)}
            aria-label={t("searchOpen")}
            title={t("searchOpen")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text hover:bg-pill"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </button>
        </div>
        {children}
      </>
    );

  return (
    <section aria-label={t("searchLabel")} data-testid="timeline-search" className="mt-4">
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t("searchLabel")}
        </label>
        <input
          ref={field}
          id={inputId}
          type="search"
          data-testid="timeline-search-input"
          value={text}
          placeholder={t("searchLabel")}
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && close()}
          className="min-h-11 w-full flex-1 rounded-full border border-border bg-surface px-4 text-text placeholder:text-muted"
        />
        <button
          type="button"
          data-testid="timeline-search-close"
          onClick={close}
          aria-label={t("searchClose")}
          title={t("searchClose")}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-pill"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div role="status" className="mt-4 text-sm text-muted" data-testid="timeline-search-status">
        {state.kind === "idle" && t("searchHint")}
        {state.kind === "results" && (state.hits.length === 0 ? t("searchEmpty", { q: state.q }) : t("searchResultsCount", { n: state.hits.length }))}
      </div>
      {/* UX: the error itself, and a real button that asks again for the same text. */}
      {state.kind === "error" && (
        <div role="alert" className="mt-2" data-testid="timeline-search-error">
          <p className="text-sm text-text">{state.offline ? tai("errOffline") : tt("errGeneric")}</p>
          <button
            type="button"
            data-testid="timeline-search-retry"
            onClick={() => run(state.q)}
            className="mt-2 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium text-text hover:bg-pill"
          >
            {ta("tryAgain")}
          </button>
        </div>
      )}

      {state.kind === "results" && state.hits.length > 0 && (
        <ul className="mt-2 space-y-3" data-testid="timeline-search-results">
          {state.hits.map((h) => (
            <li key={h.id}>
              <Link href={withOrigin(`/app/entries/${h.id}`, "/app/timeline")} data-testid={`timeline-search-hit-${h.id}`} className="block rounded-2xl border border-border bg-surface p-4 hover:border-accent">
                <span className="flex flex-wrap items-center gap-x-2 font-medium text-text">
                  {h.mood !== null && <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${MOOD_COLOURS[h.mood - 1]} ${MOOD_DOT_OUTLINE}`} aria-hidden="true" />}
                  <span>{dayLabel(h.date, dateLocaleTag)}</span>
                  {h.mood !== null && (
                    <span className="text-sm font-normal text-muted">
                      <span aria-hidden="true">·</span> {tt(`mood${h.mood}` as "mood1")}
                    </span>
                  )}
                  {h.isMoment && <MomentStar label={te("momentBadge")} />}
                </span>
                {/* The match in bold, never colour alone. */}
                <span className="mt-1 block truncate text-sm text-text" data-testid="timeline-search-snippet">
                  {h.snippet.before}
                  {h.snippet.match && <strong>{h.snippet.match}</strong>}
                  {h.snippet.after}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {state.kind === "results" && state.more && (
        <p className="mt-3 text-sm text-muted" data-testid="timeline-search-more">
          {t("searchMore")}
        </p>
      )}
    </section>
  );
}
