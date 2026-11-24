"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { INSIGHTS_TABLIST, insightsTab } from "@/lib/ui/largeText";

export type InsightsSegment = "patterns" | "ai";
// The last choice on this device (a display choice kept in the browser, as the privacy page says).
export const INSIGHTS_VIEW_KEY = "mb:insights-view";
const SEGMENTS: InsightsSegment[] = ["patterns", "ai"];
const LABEL = { patterns: "insightsSegPatterns", ai: "insightsSegAi" } as const;

const recall = (): InsightsSegment | null => {
  try {
    const kept = window.localStorage.getItem(INSIGHTS_VIEW_KEY);
    return kept === "ai" || kept === "patterns" ? kept : null;
  } catch {
    return null;
  }
};
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const remember = (segment: InsightsSegment) => {
  try {
    window.localStorage.setItem(INSIGHTS_VIEW_KEY, segment);
  } catch {
    // Storage blocked: the choice holds for this visit only.
  }
  listeners.forEach((cb) => cb());
};

// Insights' two segments, Patterns | AI (decision 258; specs/insights-ai-split.md, board 30). The page
// renders this only where AI is available, so a remembered "ai" shows nothing anywhere else (the
// Reviewer): there it's Insights as it was, with no control. A tab list whose tabs are also links to
// their own address (?view=ai, or none for Patterns), so they work without scripts; with scripts a tab
// switches in place, and the address follows (a reload keeps it; other parameters such as ?range= stay).
// Patterns is the default. The last choice on this device comes back after load, unless the address
// names one. Arrow keys, Home and End move between the tabs and select them (the tabs pattern).
export function InsightsTabs({
  initial,
  named,
  hrefs,
  patterns,
  ai,
}: {
  initial: InsightsSegment;
  // The address chose the segment (?view=ai): it wins over the one kept.
  named: boolean;
  // Each tab's own address, for a click without scripts (or opened in a new tab).
  hrefs: Record<InsightsSegment, string>;
  patterns: React.ReactNode;
  ai: React.ReactNode;
}) {
  const t = useTranslations("insights");
  // The choice kept on this device: none on the server and while the page hydrates, so the first page is the
  // default or the address's choice; then this browser's.
  const kept = useSyncExternalStore(subscribe, recall, () => null);
  // A tab chosen on this page.
  const [chosen, setChosen] = useState<InsightsSegment | null>(null);
  const selected = chosen ?? (named ? initial : (kept ?? initial));
  const id = useId();
  const tabs = useRef<Partial<Record<InsightsSegment, HTMLAnchorElement | null>>>({});

  const select = (segment: InsightsSegment, focus = false) => {
    setChosen(segment);
    remember(segment);
    const url = new URL(window.location.href);
    if (segment === "ai") url.searchParams.set("view", "ai");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (focus) tabs.current[segment]?.focus();
  };

  // The address's choice is kept too, as a click would be.
  useEffect(() => {
    if (named) remember(initial);
  }, [named, initial]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = e.key === "ArrowRight" || e.key === "ArrowLeft" ? SEGMENTS[(SEGMENTS.indexOf(selected) + 1) % SEGMENTS.length] : e.key === "Home" ? SEGMENTS[0] : e.key === "End" ? SEGMENTS[SEGMENTS.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    select(next, true);
  };

  return (
    <>
      <div role="tablist" aria-label={t("insightsTitle")} data-testid="insights-tabs" className={INSIGHTS_TABLIST} onKeyDown={onKeyDown}>
        {SEGMENTS.map((segment) => (
          <Link
            key={segment}
            ref={(el) => {
              tabs.current[segment] = el;
            }}
            href={hrefs[segment]}
            role="tab"
            id={`${id}-tab-${segment}`}
            aria-selected={selected === segment}
            aria-controls={`${id}-panel-${segment}`}
            tabIndex={selected === segment ? 0 : -1}
            data-testid={`insights-tab-${segment}`}
            onClick={(e) => {
              // A new tab or window opens the address as usual.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              select(segment);
            }}
            className={insightsTab(selected === segment)}
          >
            {t(LABEL[segment])}
          </Link>
        ))}
      </div>
      {SEGMENTS.map((segment) => (
        <div key={segment} role="tabpanel" id={`${id}-panel-${segment}`} aria-labelledby={`${id}-tab-${segment}`} hidden={selected !== segment} data-testid={`insights-panel-${segment}`}>
          {segment === "patterns" ? patterns : ai}
        </div>
      ))}
    </>
  );
}
