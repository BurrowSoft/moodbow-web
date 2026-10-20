"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import type { Milestone } from "@/lib/share/cards";
import { localKey } from "@/lib/localData";
import { ShareMonth } from "./insights/ShareMonth";

// A milestone reached (decision 169): a quiet card on Today, offered once:
// "Share it" opens the share sheet on the milestone card; "Not now" or
// opening the sheet means it never shows again for that milestone, in this
// browser. Total days journaled, never a streak.
type Props = { n: Milestone; colours: string[]; uid: string; month: string; dateLocaleTag: string; year?: number | null };

const SHARE_LABEL = "milestoneShare" as const;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const seen = (key: string) => {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

export function MilestoneCard({ n, colours, uid, month, dateLocaleTag, year = null }: Props) {
  const t = useTranslations("share");
  const key = localKey("milestone-seen", uid, String(n));
  // Until the browser says otherwise, assume it was seen: no flash of a card
  // that's already been dismissed.
  const done = useSyncExternalStore(subscribe, () => seen(key), () => true);
  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // storage unavailable: it may show again next time
    }
  }, [key]);
  const dismiss = useCallback(() => {
    markSeen();
    listeners.forEach((cb) => cb());
  }, [markSeen]);
  if (done) return null;

  return (
    <section aria-labelledby="milestone-title" data-testid="milestone-card" className="rounded-3xl border border-border bg-surface p-5">
      <h2 id="milestone-title" className="text-lg font-medium text-text">
        {t("milestoneReachedTitle", { n })}
      </h2>
      <div className="mt-4 flex flex-wrap gap-3">
        {/* Opening the sheet counts as seen; the card stays until the sheet closes. */}
        <ShareMonth month={month} dateLocaleTag={dateLocaleTag} label={SHARE_LABEL} testId="milestone-share" milestone={{ n, colours }} year={year} initialType="milestone" onOpen={markSeen} />
        <button type="button" data-testid="milestone-not-now" onClick={dismiss} className={dialogButton()}>
          {t("milestoneNotNow")}
        </button>
      </div>
    </section>
  );
}
