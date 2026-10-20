"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import type { Milestone } from "@/lib/share/cards";
import { localKey } from "@/lib/localData";
import { ShareMonth } from "./insights/ShareMonth";

// A milestone reached (decision 169): a quiet card on Today, offered once:
// "Share it" opens the share sheet on the milestone card; "Not now" or
// opening the sheet means it never shows again for that milestone, in this
// browser. Total days journaled, never a streak.
type Props = { n: Milestone; colours: string[]; uid: string; month: string; dateLocaleTag: string };

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

export function MilestoneCard({ n, colours, uid, month, dateLocaleTag }: Props) {
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
  // The spacer is in the server HTML whenever there's a milestone (the
  // server can't know it was seen), so it never appears late and never
  // pushes the footer (reviewer #82); it goes only when dismissed here, a
  // change right after the tap, which CLS doesn't count. Seen on an earlier
  // visit, it stays as blank space at the page's end.
  const [dismissedHere, setDismissedHere] = useState(false);
  const dismiss = useCallback(() => {
    markSeen();
    setDismissedHere(true);
    listeners.forEach((cb) => cb());
  }, [markSeen]);
  // Said once to screen readers when the card appears: the polite live
  // region is always there (empty in the server HTML, where it counts as
  // seen) and gets the title when the browser finds the milestone unseen.
  const status = (
    <p role="status" data-testid="milestone-announce" className="sr-only">
      {done ? null : t("milestoneReachedTitle", { n })}
    </p>
  );

  // Fixed just above the bottom tab bar (bottom-right on wide screens), out
  // of the page's flow: appearing after hydration moves nothing (decision
  // 186, Today's CLS). The spacer (above) keeps Today's last content
  // reachable above it.
  // The live region keeps its place in the tree either way (a remounted one
  // may not be announced).
  return (
    <>
      {!dismissedHere && <div aria-hidden="true" data-testid="milestone-spacer" className="h-44 md:h-40" />}
      {!done && (
        <section
          aria-labelledby="milestone-title"
          data-testid="milestone-card"
          className="milestone-in fixed inset-x-3 bottom-20 z-10 rounded-3xl border border-border bg-surface p-5 shadow-lg min-[360px]:inset-x-4 md:inset-x-auto md:bottom-6 md:right-6 md:w-96"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 id="milestone-title" className="text-lg font-medium text-text">
              {t("milestoneReachedTitle", { n })}
            </h2>
            <button
              type="button"
              data-testid="milestone-close"
              onClick={dismiss}
              aria-label={t("milestoneNotNow")}
              title={t("milestoneNotNow")}
              className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-pill"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {/* Opening the sheet counts as seen; the card stays until the sheet closes. */}
            <ShareMonth month={month} dateLocaleTag={dateLocaleTag} label={SHARE_LABEL} testId="milestone-share" milestone={{ n, colours }} initialType="milestone" onOpen={markSeen} />
            <button type="button" data-testid="milestone-not-now" onClick={dismiss} className={dialogButton()}>
              {t("milestoneNotNow")}
            </button>
          </div>
        </section>
      )}
      {status}
    </>
  );
}
