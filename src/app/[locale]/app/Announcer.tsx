"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// One polite live region above the routes, for a notice that outlives the
// page that caused it. A deleted entry is the case: the server's redirect
// replaces the page, and any region in it, so "Entry deleted" is said from
// here (parity with the app). Always mounted, so a new text is announced; it
// clears after a while, so it isn't left for the reading cursor to find.
export const AnnounceContext = createContext<((text: string) => void) | null>(null);

const SET_AFTER_MS = 100;
const CLEAR_AFTER_MS = 5000;

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
  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <p role="status" className="sr-only" data-testid="app-announce">
        {text}
      </p>
    </AnnounceContext.Provider>
  );
}

// null outside the provider (tests, pages outside /app).
export const useAnnounce = () => useContext(AnnounceContext);
