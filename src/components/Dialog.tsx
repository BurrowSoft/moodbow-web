"use client";

import { useEffect, useId, useRef } from "react";

// A small modal dialog: a title, a body and a row of actions. Focus moves
// into it when it opens and returns to where it was when it closes; Escape
// is the same as the cancel action.
export function Dialog({
  title,
  body,
  onCancel,
  children,
  testId,
}: {
  title: string;
  body?: string;
  onCancel: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  const titleId = useId();
  const bodyId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onCancel]);

  return (
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
        <h2 id={titleId} className="text-lg font-medium text-text">
          {title}
        </h2>
        {body && (
          <p id={bodyId} className="mt-2 text-muted">
            {body}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">{children}</div>
      </div>
    </div>
  );
}

export const dialogButton = (primary = false) =>
  `inline-flex min-h-11 items-center justify-center rounded-full px-5 font-medium ${
    primary ? "bg-accent text-on-accent hover:opacity-90" : "border border-border text-text hover:bg-pill"
  }`;
