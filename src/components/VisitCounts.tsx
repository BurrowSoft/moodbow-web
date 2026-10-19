"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { computeRoute } from "@vercel/analytics";
import { Analytics } from "@vercel/analytics/react";
import { NOT_FOUND_MARK, scrubEvent } from "@/lib/analytics";

// Vercel Web Analytics with the URL scrubber (lib/analytics.ts). Rendered
// only when the "web-analytics" condition is met (the locale layout).
//
// A page view is sent once the page has arrived, not on the URL change:
// under /app a loading boundary streams first, and a missing entry's "not
// found" only replaces it later, so counting at the URL change counted it
// (Web Tester, #30). We wait until no loading boundary is on the page; if
// what arrived is a not-found page, nothing is sent. The route is the
// pattern (/[locale]/app/entries/[id]), as in the Next adapter, never the
// ids. 30 s without arriving: nothing is sent.
export const SETTLE_LIMIT_MS = 30_000;
const LOADING = "[data-loading-boundary]";

export function VisitCounts() {
  const path = usePathname();
  const params = useParams();
  // How the last page settled: counted (its route) or not (null, a
  // not-found page or no arrival). It only counts for the page it names.
  const [arrived, setArrived] = useState<{ path: string; route: string | null } | null>(null);
  const counted = arrived !== null && arrived.path === path && arrived.route !== null ? arrived : null;

  useEffect(() => {
    const route = computeRoute(path, params as Record<string, string | string[]> | null);
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
  // off and only these page views are sent.
  return <Analytics framework="next" beforeSend={scrubEvent} route={counted?.route ?? null} path={counted?.path} />;
}
