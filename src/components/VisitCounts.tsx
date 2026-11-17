"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useParams, usePathname } from "next/navigation";
import { computeRoute } from "@vercel/analytics";
import { Analytics } from "@vercel/analytics/react";
import { isCountedPage, NOT_FOUND_MARK, scrubEvent } from "@/lib/analytics";
import { countFromElement, setTapsOn } from "@/lib/analyticsEvents";

// Vercel Web Analytics with the URL and event scrubber (lib/analytics.ts).
// Rendered only when the "web-analytics" condition is met, on production (the
// locale layout). Page views and button taps, in aggregate (specs/analytics.md).
//
// A page view is sent once the page has arrived, not on the URL change:
// a loading boundary may stream first, and a missing page's "not found"
// only replaces it later, so counting at the URL change counted it
// (Web Tester, #30, then on /app). We wait until no loading boundary is on the page; if
// what arrived is a not-found page, nothing is sent. The route is the
// pattern (/[locale]/app/entries/[id]), as in the Next adapter, never the
// ids. 30 s without arriving: nothing is sent.
export const SETTLE_LIMIT_MS = 30_000;
const LOADING = "[data-loading-boundary]";

// The browser's own "don't track me" (UX & PM, Q8): nothing loads at all.
export function browserSaysNo(nav: Navigator & { globalPrivacyControl?: boolean } = navigator): boolean {
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1";
}

const noSubscribe = () => () => {};
const browserSaysYes = () => !browserSaysNo();
const notOnServer = () => false;

export function VisitCounts() {
  // Read in the browser only: the server's render (and hydration) has no counter.
  const allowed = useSyncExternalStore(noSubscribe, browserSaysYes, notOnServer);
  useEffect(() => {
    if (!allowed) return;
    setTapsOn(true);
    // Taps on server-rendered buttons (data-count, lib/analyticsEvents).
    const onClick = (e: MouseEvent) => countFromElement(e.target instanceof Element ? e.target : null);
    document.addEventListener("click", onClick, true);
    return () => {
      setTapsOn(false);
      document.removeEventListener("click", onClick, true);
    };
  }, [allowed]);
  return allowed ? <Counter /> : null;
}

function Counter() {
  const path = usePathname();
  const params = useParams();
  // How the last page settled: counted (its route) or not (null, a
  // not-found page, a page never counted, or no arrival). It only counts for
  // the page it names.
  const [arrived, setArrived] = useState<{ path: string; route: string | null } | null>(null);
  const counted = arrived !== null && arrived.path === path && arrived.route !== null ? arrived : null;

  useEffect(() => {
    const route = isCountedPage(path) ? computeRoute(path, params as Record<string, string | string[]> | null) : null;
    let done = false;
    const settle = () => {
      if (done || document.querySelector(LOADING)) return;
      done = true;
      stop();
      setArrived({ path, route: document.querySelector(`[${NOT_FOUND_MARK}]`) ? null : route });
    };
    const observer = new MutationObserver(settle);
    const timer = window.setTimeout(() => {
      done = true;
      stop();
      setArrived({ path, route: null });
    }, SETTLE_LIMIT_MS);
    function stop() {
      observer.disconnect();
      window.clearTimeout(timer);
    }
    observer.observe(document.body, { childList: true, subtree: true });
    settle();
    return () => {
      done = true;
      stop();
    };
    // params change with the path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // route null (not undefined) until then: the script's own tracking stays
  // off and only these page views are sent. The path builds the address the
  // script sends, and beforeSend scrubs it (ids, dates, queries).
  return <Analytics framework="next" beforeSend={scrubEvent} route={counted?.route ?? null} path={counted?.path} />;
}
