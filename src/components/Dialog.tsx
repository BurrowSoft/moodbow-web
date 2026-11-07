"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A small modal dialog: a title, a body and a row of actions. Client-only:
// it renders into document.body (a portal), so it must never be open on
// the server's first render (every caller opens it on a user action). Focus moves
// into it when it opens (to the first action, or the last one: the safe
// choice, never a destructive one), stays inside it (Tab wraps) and returns
// to where it was when it closes; Escape is the same as the cancel action.
// Taller than the window (large text): it opens at its top, with focus on the
// title, not scrolled down to a button past the title and warning, and a fade at
// the bottom shows there's more, until the end is reached. Nothing here limits touch or keyboard scrolling.
export function Dialog({
  title,
  body,
  details,
  onCancel,
  children,
  testId,
  initialFocus = "first",
  capText = false,
}: {
  title: string;
  body?: string;
  // Shown between the body and the buttons (the check-in conflict's two versions).
  details?: React.ReactNode;
  onCancel: () => void;
  children: React.ReactNode;
  testId?: string;
  // "title": focus the heading itself (the safety card, decision 124).
  initialFocus?: "first" | "last" | "title";
  // Text capped to the screen's width, below the reader's own setting at large text
  // on a narrow screen. The safety card only (UX & PM 2026-11-06): reaching help
  // justifies it there, and other dialogs open at their top and scroll.
  capText?: boolean;
}) {
  const titleId = useId();
  const bodyId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const measure = () => {
      setTall(dialog.scrollHeight > dialog.clientHeight);
      setAtEnd(dialog.scrollTop + dialog.clientHeight >= dialog.scrollHeight - 1);
    };
    measure();
    window.addEventListener("resize", measure);
    dialog.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      dialog.removeEventListener("scroll", measure);
    };
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Initial focus goes to an action (a button); Tab cycles through
    // everything focusable inside (fields too).
    const buttons = () => Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    const focusable = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]") ?? []);
    const start = buttons();
    const dialog = ref.current;
    if (initialFocus === "title" || (dialog && dialog.scrollHeight > dialog.clientHeight)) {
      dialog?.querySelector<HTMLElement>("h2")?.focus();
      if (dialog) dialog.scrollTop = 0;
    } else (initialFocus === "last" ? start[start.length - 1] : start[0])?.focus();
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

  // capText (the help card): the spacing gives way as the text grows, the same at the normal size, so
  // the first help fits the first screen at large text (UX, #247). No smaller text, no new order.
  return createPortal(
    <div className={`fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center ${capText ? "p-[max(4px,calc(32px-1rem))]" : "p-[16px]"}`}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        data-testid={testId}
        className={`max-h-full w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl bg-surface p-[var(--pad)] shadow-xl ${capText ? "[--pad:max(8px,calc(40px-1rem))] [--fade:max(24px,calc(56px-1rem))] leading-normal [font-size:min(1rem,max(8vw,16px))]" : "[--pad:24px] [--fade:40px] max-sm:[font-size:min(1rem,max(10vw,32px))]"}`}
      >
        <h2 id={titleId} tabIndex={-1} className={`font-medium text-text outline-none ${capText ? "leading-tight [font-size:min(1.125rem,max(8vw,18px))]" : "leading-[1.556] [font-size:min(1.125rem,max(11vw,35px))]"}`}>
          {title}
        </h2>
        {body && (
          <p id={bodyId} className={`text-muted ${capText ? "mt-[max(4px,calc(24px-1rem))]" : "mt-[8px]"}`}>
            {body}
          </p>
        )}
        {details && <div className="mt-[16px]">{details}</div>}
        <div className="mt-[var(--pad)] flex flex-wrap justify-end gap-[12px]">{children}</div>
        {tall && <div aria-hidden="true" data-testid="dialog-more" className={`pointer-events-none sticky bottom-[calc(var(--pad)*-1)] mx-[calc(var(--pad)*-1)] mb-[calc(var(--pad)*-1)] mt-[8px] h-[var(--fade)] bg-gradient-to-t from-surface to-transparent ${atEnd ? "opacity-0" : ""}`} />}
      </div>
    </div>,
    document.body,
  );
}

export const dialogButton = (primary = false) =>
  `inline-flex min-h-11 max-w-full items-center justify-center rounded-full px-[20px] text-center font-medium hyphens-auto [overflow-wrap:anywhere] ${
    primary ? "bg-accent text-on-accent hover:bg-accent-hover" : "border border-border text-text hover:bg-pill"
  }`;
