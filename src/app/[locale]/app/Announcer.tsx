"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// One polite live region above the routes, for a notice that outlives the
// page that caused it. A deleted entry is the case: the server's redirect
// replaces the page, and any region in it, so "Entry deleted" is said from
// here (parity with the app). Always mounted, so a new text is announced; it
// clears after a while, so it isn't left for the reading cursor to find.
export const AnnounceContext = createContext<((text: string) => void) | null>(null);

// The same redirect's focus (app #104): once the page has changed, focus goes
// to its title (the h1 in main), not the top of the document. A one-shot
// request kept here, above the routes, which the redirect doesn't replace;
// a request whose navigation never comes expires.
export const FocusTitleContext = createContext<(() => void) | null>(null);

const SET_AFTER_MS = 100;
const CLEAR_AFTER_MS = 5000;
const FOCUS_EXPIRES_MS = 10_000;

function focusTitle(): boolean {
  const h1 = document.querySelector<HTMLElement>("#main h1");
  if (!h1) return false;
  // Focusable from script only, not a tab stop.
  if (!h1.hasAttribute("tabindex")) h1.setAttribute("tabindex", "-1");
  h1.focus();
  return true;
}

export function AnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [text, setText] = useState("");
  const timers = useRef<number[]>([]);
  const announce = useCallback((next: string) => {
    for (const id of timers.current) window.clearTimeout(id);
    // Empty first, so the same notice twice is announced again.
    setText("");
    timers.current = [window.setTimeout(() => setText(next), SET_AFTER_MS), window.setTimeout(() => setText(""), SET_AFTER_MS + CLEAR_AFTER_MS)];
  }, []);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  const pathname = usePathname();
  const here = useRef(pathname);
  const focusRequest = useRef<{ from: string; at: number } | null>(null);
  const requestFocusTitle = useCallback(() => {
    focusRequest.current = { from: here.current, at: Date.now() };
  }, []);
  useEffect(() => {
    here.current = pathname;
    const request = focusRequest.current;
    if (!request || request.from === pathname) return;
    focusRequest.current = null;
    if (Date.now() - request.at > FOCUS_EXPIRES_MS || focusTitle()) return;
    // The page may still be streaming in: its title, as soon as it's there.
    let timer: number | undefined;
    const observer = new MutationObserver(() => {
      if (!focusTitle()) return;
      observer.disconnect();
      window.clearTimeout(timer);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    timer = window.setTimeout(() => observer.disconnect(), FOCUS_EXPIRES_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return (
    <AnnounceContext.Provider value={announce}>
      <FocusTitleContext.Provider value={requestFocusTitle}>
        {children}
        <p role="status" className="sr-only" data-testid="app-announce">
          {text}
        </p>
      </FocusTitleContext.Provider>
    </AnnounceContext.Provider>
  );
}

// null outside the provider (tests, pages outside /app).
export const useAnnounce = () => useContext(AnnounceContext);
export const useFocusTitleAfterLeaving = () => useContext(FocusTitleContext);
