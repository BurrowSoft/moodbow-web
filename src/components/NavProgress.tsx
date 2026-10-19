"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// A thin bar at the top while an in-app navigation is on its way (UX, after
// the Web Tester's #14 case: if Auth is slow before a link was prefetched,
// a tab click showed nothing for up to 10 s). It appears ~300 ms after the
// click, so fast navigations never flash it; it carries no text, and the
// page's main region is aria-busy meanwhile. The 3 s "Taking longer than
// usual…" line (SlowLoading) still comes from the loading boundary.
//
// No router events in the App Router, so: a click on an internal link
// notes where we were; the navigation is "pending" for as long as we're
// still there. Any arrival (the page, its error state, a redirect
// elsewhere) ends it, and 30 s is the outer limit.
export const SHOW_AFTER_MS = 300;
const GIVE_UP_MS = 30_000;

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
  const here = `${usePathname()}?${useSearchParams().toString()}`;
  // Where a navigation started from; it's pending while we're still there.
  const [from, setFrom] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const pending = from !== null && from === here;
  const visible = pending && shown === from;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (internalTarget(e)) setFrom(`${location.pathname}?${new URLSearchParams(location.search).toString()}`);
    };
    // Capture: Next's Link prevents the default itself, after this.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const show = window.setTimeout(() => setShown(from), SHOW_AFTER_MS);
    const giveUp = window.setTimeout(() => setFrom(null), GIVE_UP_MS);
    return () => {
      window.clearTimeout(show);
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
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-pill" aria-hidden="true" data-testid="nav-progress">
      <div className="h-full w-1/3 animate-[nav-progress_1.2s_ease-in-out_infinite] bg-accent motion-reduce:w-full motion-reduce:animate-none" />
    </div>
  );
}
