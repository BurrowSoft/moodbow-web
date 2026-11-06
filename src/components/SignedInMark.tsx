"use client";

import { useLayoutEffect } from "react";

// On a page outside the journal, with a session: the saved language decides here
// too and Me → Language is the one control, so the footer's language switcher
// steps aside (globals.css; a link there would be sent straight back; UX & PM
// 2026-11-06). The footer is in the root layout and doesn't know who's signed in.
// An attribute on the root, not :has(), which older browsers don't all have.
export function SignedInMark() {
  useLayoutEffect(() => {
    document.documentElement.dataset.signedIn = "";
    return () => {
      delete document.documentElement.dataset.signedIn;
    };
  }, []);
  return null;
}
