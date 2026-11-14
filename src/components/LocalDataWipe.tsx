"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { wipeCookieUid, wipeLocalData } from "@/lib/localData";
import { removePicture } from "@/lib/me/picture";

// After the account was deleted (the mb_wipe cookie, decision 85: set by the
// proxy on account_gone, or by Me → Delete account): remove that user's
// journal copies from this browser, and the cookie with them. Runs on every
// page, and again on every client-side navigation (a redirect after a
// server action keeps this layout mounted), so the wipe doesn't depend on
// how the visitor got to the next page.
export function LocalDataWipe() {
  const pathname = usePathname();
  useEffect(() => {
    const uid = wipeCookieUid(document.cookie);
    if (!uid) return;
    try {
      wipeLocalData(window.localStorage, uid);
    } catch {
      // storage unavailable: nothing was kept here either
    }
    // Me's own picture (lib/me/picture) goes with them.
    void removePicture(uid).catch(() => {});
    document.cookie = `mb_wipe=; Max-Age=0; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, [pathname]);
  return null;
}
