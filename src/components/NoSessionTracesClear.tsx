"use client";

import { useEffect } from "react";
import { NO_SESSION_TRACE_KINDS, wipeKindsForEveryone } from "@/lib/localData";

// With no session (SessionEnded, the sign-in page): the traces that would tell the next person here
// something about whoever was signed in go, for every user (the late-night note's mark: UX and the
// Web Tester, #366). A session the server ended never ran Me → Sign out, so this is where they go.
export function NoSessionTracesClear() {
  useEffect(() => {
    try {
      wipeKindsForEveryone(window.localStorage, NO_SESSION_TRACE_KINDS);
    } catch {
      // storage unavailable: nothing was kept either
    }
  }, []);
  return null;
}
