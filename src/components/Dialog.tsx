"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

// A small modal dialog: a title, a body and a row of actions. Client-only:
// it renders into document.body (a portal), so it must never be open on
// the server's first render (every caller opens it on a user action). Focus moves
// into it when it opens (to the first action, or the last one: the safe
// choice, never a destructive one), stays inside it (Tab wraps) and returns
// to where it was when it closes; Escape is the same as the cancel action.
export function Dialog({
  title,
  body,
  onCancel,
  children,
  testId,
  initialFocus = "first",
}: {
  title: string;
  body?: string;
  onCancel: () => void;
  children: React.ReactNode;
  testId?: string;
  // "title": focus the heading itself (the safety card, decision 124).
  initialFocus?: "first" | "last" | "title";
}) {
  const titleId = useId();
  const bodyId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Initial focus goes to an action (a button); Tab cycles through
    // everything focusable inside (fields too).
    const buttons = () => Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    const focusable = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]") ?? []);
    const start = buttons();
    if (initialFocus === "title") ref.current?.querySelector<HTMLElement>("h2")?.focus();
    else (initialFocus === "last" ? start[start.length - 1] : start[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onCancel();
      if (e.key !== "Tab") return;
      const list = focusable();
      if (list.length === 0) return;
      // Focus that isn't on one of them (the title, focused on open, or
      // outside) wraps too: Shift+Tab from the safety card's title used to
      // leave the dialog (a11y pass).
      const at = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && at <= 0) {
        e.preventDefault();
        list[list.length - 1].focus();
      } else if (!e.shiftKey && (at === -1 || at === list.length - 1)) {
        e.preventDefault();
        list[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Everything else is inert while it's open, so a touch screen reader
    // can't swipe into the page behind it (aria-modal alone isn't enough
    // everywhere; a11y pass). The dialog itself is portalled to <body>.
    const overlay = ref.current?.parentElement;
    const madeInert = Array.from(document.body.children).filter((el) => el !== overlay && !el.hasAttribute("inert"));
    for (const el of madeInert) el.setAttribute("inert", "");
    return () => {
      for (const el of madeInert) el.removeAttribute("inert");
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onCancel, initialFocus]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        data-testid={testId}
        className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-xl"
      >
        <h2 id={titleId} tabIndex={initialFocus === "title" ? -1 : undefined} className="text-lg font-medium text-text outline-none">
          {title}
        </h2>
        {body && (
          <p id={bodyId} className="mt-2 text-muted">
            {body}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export const dialogButton = (primary = false) =>
  `inline-flex min-h-11 items-center justify-center rounded-full px-5 font-medium ${
    primary ? "bg-accent text-on-accent hover:bg-accent-hover" : "border border-border text-text hover:bg-pill"
  }`;
