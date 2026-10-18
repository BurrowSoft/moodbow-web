"use client";

import { useEffect } from "react";
import { wipeCookieUid, wipeLocalData } from "@/lib/localData";

// After the proxy found the account deleted (mb_wipe cookie, decision 85):
// remove that user's journal copies from this browser and the cookie with
// them. Runs on every page, so the wipe doesn't depend on where the visitor
// lands next.
export function LocalDataWipe() {
  useEffect(() => {
    const uid = wipeCookieUid(document.cookie);
    if (!uid) return;
    try {
      wipeLocalData(window.localStorage, uid);
    } catch {
      // storage unavailable: nothing was kept here either
    }
    document.cookie = `mb_wipe=; Max-Age=0; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, []);
  return null;
}
