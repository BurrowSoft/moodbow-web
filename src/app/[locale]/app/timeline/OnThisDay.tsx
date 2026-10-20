"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { MOOD_COLOURS, MOOD_DOT_OUTLINE } from "@/lib/journal/checkIn";
import type { OnThisDayKind } from "@/lib/journal/onThisDay";
import { withOrigin } from "@/lib/journal/origin";
import { localKey } from "@/lib/localData";

// "On this day" (1.1 A): a quiet card at the top of the Timeline for a moment
// from a month, 6 months or a year ago today (lib/journal/onThisDay.ts picks
// it). ✕ hides it for the rest of today, in this browser only.
const LABELS: Record<OnThisDayKind, "onThisDayYear" | "onThisDay6Months" | "onThisDayMonth"> = {
  year: "onThisDayYear",
  sixMonths: "onThisDay6Months",
  month: "onThisDayMonth",
};

type Props = { kind: OnThisDayKind; entryId: string; dateLabel: string; preview: string; mood: number | null; uid: string; today: string };

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const read = (key: string) => {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

export function OnThisDay({ kind, entryId, dateLabel, preview, mood, uid, today }: Props) {
  const t = useTranslations("timeline");
  const tt = useTranslations("today");
  // One key per user and day: a new day shows its card again.
  const key = localKey("on-this-day-hidden", uid, today);
  const hidden = useSyncExternalStore(subscribe, () => read(key), () => false);
  const hide = useCallback(() => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // storage unavailable: hidden until the page reloads
    }
    listeners.forEach((cb) => cb());
    // The ✕ goes with the card: focus moves to the Timeline's heading rather
    // than dropping to the page (Web Tester a11y pass).
    document.getElementById("timeline-title")?.focus();
  }, [key]);
  if (hidden) return null;

  return (
    <section aria-labelledby="on-this-day-title" data-testid="on-this-day" className="mt-6 rounded-3xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="on-this-day-title" className="text-sm font-medium text-accent">
          {t(LABELS[kind])}
        </h2>
        <button
          type="button"
          data-testid="on-this-day-dismiss"
          onClick={hide}
          aria-label={t("onThisDayDismiss")}
          title={t("onThisDayDismiss")}
          className="-mr-2 -mt-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-pill"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <Link href={withOrigin(`/app/entries/${entryId}`, "/app/timeline")} data-testid="on-this-day-entry" className="mt-1 block rounded-lg text-text hover:text-accent">
        <span className="flex items-center gap-2 text-sm text-muted">
          {mood !== null && <span className={`h-3 w-3 shrink-0 rounded-full ${MOOD_COLOURS[mood - 1]} ${MOOD_DOT_OUTLINE}`} aria-hidden="true" />}
          {dateLabel}
          {/* The mood in words beside its dot, as on the Timeline rows (decision 161). */}
          {mood !== null && (
            <span data-testid="on-this-day-mood">
              <span aria-hidden="true">·</span> {tt(`mood${mood}` as "mood1")}
            </span>
          )}
        </span>
        <span className="mt-1 line-clamp-2 whitespace-pre-line">{preview}</span>
      </Link>
    </section>
  );
}
