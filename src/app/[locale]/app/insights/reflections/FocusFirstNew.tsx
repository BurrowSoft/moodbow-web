"use client";

import { useEffect } from "react";

// After Show more, focus goes to the first of the rows it added (the link's address ends
// #reflection-N, that row's id), so a keyboard or screen reader carries on from there instead of
// staying at the bottom. shown: the page's ?shown=, so this runs again after each Show more.
export function FocusFirstNew({ shown }: { shown: number }) {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (/^reflection-\d+$/.test(id)) document.getElementById(id)?.focus();
  }, [shown]);
  return null;
}
