"use client";

import { useEffect, useState } from "react";

// Whether a phone's on-screen keyboard is up (UX: the bottom tab bar hides
// while it is, as in the app). Browsers don't say so directly; a phone
// (coarse pointer) with a text field focused whose visual viewport has
// shrunk by more than a quarter is the reliable sign (iOS Safari and Android
// Chrome both shrink it for the keyboard). A hardware keyboard shrinks
// nothing, so the bar stays; pinch zoom is divided out (scale).
const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", "password", "number", "date", "time"]);
const SHRUNK = 0.75;

export function isTextField(el: Element | null): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return TEXT_INPUTS.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable === true;
}

export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !window.matchMedia?.("(pointer: coarse)").matches) return;
    const height = () => vv.height * vv.scale;
    // The viewport's height without the keyboard: re-measured whenever no
    // text field is focused (rotation, browser bars).
    let full = height();
    const update = () => {
      const typing = isTextField(document.activeElement);
      if (!typing) full = height();
      setOpen(typing && height() < full * SHRUNK);
    };
    // Focus leaves before the next one arrives: measure after it settles.
    const later = () => window.setTimeout(update, 0);
    vv.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", later);
    return () => {
      vv.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", later);
    };
  }, []);
  return open;
}
