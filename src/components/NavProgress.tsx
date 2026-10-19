"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SLOW_AFTER_MS } from "./SlowLoading";

// A thin bar at the top while an in-app navigation is on its way (UX, after
// the Web Tester's #14 case: if Auth is slow before a link was prefetched,
// a tab click showed nothing for up to 10 s). It appears ~300 ms after the
// click, so fast navigations never flash it, and the page's main region is
// aria-busy meanwhile. At 3 s, if no loading boundary is showing its own
// "Taking longer than usual…" (SlowLoading), the bar shows that line in a
// polite live region under it (UX, after the Web Tester's #28 run: without
// a prefetch there's no boundary, so the bar was the only feedback).
//
// No router events in the App Router, so: a click on an internal link
// notes where we were; the navigation is "pending" for as long as we're
// still there. Any arrival (the page, its error state, a redirect
// elsewhere) ends it, and 30 s is the outer limit.
// Only link clicks show it: programmatic navigations (router.push, a
// server action's redirect, the browser's Back/Forward) don't, by design
// (they have their own feedback: the form's pending state, or the
// browser's own loading indicator).
export const SHOW_AFTER_MS = 300;
const GIVE_UP_MS = 30_000;
let clicks = 0;

function internalTarget(e: MouseEvent): string | null {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a || a.target === "_blank" || a.hasAttribute("download")) return null;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return null;
  const to = url.pathname + url.search;
  return to === location.pathname + location.search ? null : to;
}

export function NavProgress() {
  const t = useTranslations("app");
  const here = `${usePathname()}?${useSearchParams().toString()}`;
  // Where a navigation started from (and which click it was); it's pending
  // while we're still there. `shown` names the click whose bar is up, so a
  // later click (even from the same page) starts its own 300 ms wait.
  const [from, setFrom] = useState<{ at: string; click: number } | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  // The click whose 3 s passed with no loading boundary's own line showing.
  const [slow, setSlow] = useState<number | null>(null);
  const pending = from !== null && from.at === here;
  const visible = pending && shown === from.click;
  const slowLine = visible && slow === from.click;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (internalTarget(e)) setFrom({ at: `${location.pathname}?${new URLSearchParams(location.search).toString()}`, click: ++clicks });
    };
    // Capture: Next's Link prevents the default itself, after this.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const click = from!.click;
    const show = window.setTimeout(() => setShown(click), SHOW_AFTER_MS);
    const slowTimer = window.setTimeout(() => {
      if (!document.querySelector("[data-loading-boundary]")) setSlow(click);
    }, SLOW_AFTER_MS);
    const giveUp = window.setTimeout(() => setFrom(null), GIVE_UP_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(slowTimer);
      window.clearTimeout(giveUp);
    };
  }, [pending, from]);

  useEffect(() => {
    const main = document.getElementById("main");
    if (!main) return;
    if (visible) main.setAttribute("aria-busy", "true");
    else main.removeAttribute("aria-busy");
  }, [visible]);

  if (!visible) return null;
  // The live region is there from the bar's start (empty), so screen
  // readers announce the line when it's filled in.
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center">
      <div className="h-1 w-full overflow-hidden bg-pill" aria-hidden="true" data-testid="nav-progress">
        <div className="h-full w-1/3 animate-[nav-progress_1.2s_ease-in-out_infinite] bg-accent motion-reduce:w-full motion-reduce:animate-none" />
      </div>
      <p role="status" data-testid="nav-slow" className="mt-2 empty:sr-only rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted">
        {slowLine ? t("slowLoading") : null}
      </p>
    </div>
  );
}
