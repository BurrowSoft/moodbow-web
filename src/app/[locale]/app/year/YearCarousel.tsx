"use client";

import { useRef, useState, type ReactNode } from "react";

// Your year in Moodbow's screens (1.4 A; boards 27 and 27b): one card at a time with "Screen n of
// total" on it, round Previous and Next (48 px; Next filled) around the dots, a swipe on touch, and
// below them what's on every screen (the share). Nothing slides, so reduced motion has nothing to
// turn off. The screens are rendered on the server and only shown or hidden here; which one is
// open is never counted or stored. The position is also a polite live region, and a button (never
// a swipe) moves focus to the new screen's heading.
const SWIPE_PX = 50;
const ROUND = "inline-flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full disabled:opacity-40";

export function YearCarousel({ screens, labels, footer }: { screens: { id: string; node: ReactNode }[]; labels: { previous: string; next: string; region: string; positions: string[] }; footer?: ReactNode }) {
  const [at, setAt] = useState(0);
  const total = screens.length;
  const startX = useRef<number | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const go = (to: number, focus: boolean) => {
    const next = Math.max(0, Math.min(total - 1, to));
    if (next === at) return;
    setAt(next);
    if (focus) requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-screen="${screens[next].id}"] h2`)?.focus());
  };

  return (
    <div
      ref={root}
      role="region"
      aria-label={labels.region}
      data-testid="year-carousel"
      className="space-y-[14px]"
      onTouchStart={(e) => (startX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const from = startX.current;
        startX.current = null;
        const to = e.changedTouches[0]?.clientX;
        if (from === null || to === undefined || Math.abs(to - from) < SWIPE_PX) return;
        // Right to left reads forward on a left-to-right page, the other way on a right-to-left one.
        const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
        go(at + ((to < from) !== rtl ? 1 : -1), false);
      }}
    >
      {screens.map((s, i) => (
        <div key={s.id} data-screen={s.id} data-testid={`year-screen-${s.id}`} role="group" aria-label={labels.positions[i]} hidden={i !== at} className="rounded-3xl bg-surface px-[20px] py-[24px]">
          <p aria-hidden="true" className="mb-[12px] text-[13px] text-muted">
            {labels.positions[i]}
          </p>
          {s.node}
        </div>
      ))}
      <p role="status" className="sr-only" data-testid="year-position">
        {labels.positions[at]}
      </p>
      {total > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button type="button" data-testid="year-previous" aria-label={labels.previous} onClick={() => go(at - 1, true)} disabled={at === 0} className={`${ROUND} bg-surface text-text`}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <span aria-hidden="true" className="flex min-w-0 flex-wrap items-center justify-center gap-[6px]">
            {screens.map((s, i) => (
              <span key={s.id} className={`block h-[8px] rounded-full ${i === at ? "w-[20px] bg-accent" : "w-[8px] bg-border"}`} />
            ))}
          </span>
          <button type="button" data-testid="year-next" aria-label={labels.next} onClick={() => go(at + 1, true)} disabled={at === total - 1} className={`${ROUND} bg-accent text-on-accent`}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      )}
      {footer}
    </div>
  );
}
