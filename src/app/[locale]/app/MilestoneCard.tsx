"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { Link } from "@/i18n/navigation";
import { PlusLock } from "./PlusSheet";
import type { Milestone } from "@/lib/share/cards";
import { localKey } from "@/lib/localData";
import { ShareMonth } from "./insights/ShareMonth";

// A milestone reached (decision 169): a quiet card on Today, offered once:
// "Share it" opens the share sheet on the milestone card; "Not now" or
// opening the sheet means it never shows again for that milestone, in this
// browser. Total days journaled, never a streak.
// inline: at the top of Timeline's list (Vitor, 14 Nov), in the page's flow, not floating.
// shareLocked: Share it is Plus; without it, a lock to the Plus screen (spec "Insights become Plus", 6).
type Props = { n: Milestone; colours: string[]; uid: string; month: string; dateLocaleTag: string; year?: number | null; inline?: boolean; shareLocked?: boolean };

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

export function MilestoneCard({ n, colours, uid, month, dateLocaleTag, year = null, inline = false, shareLocked = false }: Props) {
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
  const card = useRef<HTMLElement>(null);
  const dismiss = useCallback(() => {
    // The card (and the focused button) go: if focus was in it, it moves to
    // Today's heading rather than dropping to the page (Web Tester #82, as
    // #85), without scrolling the page up to it (the card floats at the
    // bottom; reviewer #82).
    const hadFocus = !!card.current?.contains(document.activeElement);
    markSeen();
    listeners.forEach((cb) => cb());
    if (hadFocus) (document.getElementById("today-title") ?? document.querySelector<HTMLElement>("main h1"))?.focus({ preventScroll: true });
  }, [markSeen]);
  // While the card floats, the page gets room for it at its very end, after
  // the footer (Web Tester #82: an in-page spacer still left the footer
  // under the card): space added below everything moves nothing (no CLS).
  useEffect(() => {
    if (done || inline) return;
    document.body.classList.add("has-floating-card");
    return () => document.body.classList.remove("has-floating-card");
  }, [done, inline]);
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
  // 186, Today's CLS). The body's bottom room (above) keeps the page's end,
  // footer included, reachable above it. Px and the safety card's cap, so at 300 % the title
  // keeps its width and the X and Not now stay in view; only the tab bar's height is rem, as
  // the card has to clear the bar. The same as ever at normal size.
  // The live region keeps its place in the tree either way (a remounted one
  // may not be announced).
  return (
    <>
      {!done && (
        <section
          ref={card}
          aria-labelledby="milestone-title"
          data-testid="milestone-card"
          className={inline ? "mt-4 rounded-3xl border border-border bg-surface p-[20px] [overflow-wrap:anywhere] [font-size:min(1rem,max(8vw,16px))]" : "milestone-in fixed inset-x-[12px] bottom-[calc(3.5rem+24px)] z-10 max-h-[calc(100dvh-3.5rem-32px)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-3xl [overflow-wrap:anywhere] border border-border bg-surface p-[20px] shadow-lg [font-size:min(1rem,max(8vw,16px))] min-[360px]:inset-x-[16px] md:inset-x-auto md:bottom-6 md:right-6 md:w-96"}
        >
          <div className="flex items-start justify-between gap-[8px]">
            <h2 id="milestone-title" className="min-w-0 flex-1 font-medium leading-[1.556] text-text [font-size:min(1.125rem,max(9vw,18px))]">
              {t("milestoneReachedTitle", { n })}
            </h2>
            <button
              type="button"
              data-testid="milestone-close"
              onClick={dismiss}
              aria-label={t("milestoneNotNow")}
              title={t("milestoneNotNow")}
              className="-mr-[8px] -mt-[8px] inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-muted hover:bg-pill"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="mt-[16px] flex flex-wrap gap-[12px] [&_button]:min-h-[44px]">
            {/* Opening the sheet counts as seen; the card stays until the sheet closes. */}
            {shareLocked ? (
              <Link href="/app/me/plus" data-testid="milestone-share" data-locked="" className={`${dialogButton(true)} inline-flex items-center gap-2`}>
                {t(SHARE_LABEL)}
                <PlusLock />
              </Link>
            ) : (
              <ShareMonth month={month} dateLocaleTag={dateLocaleTag} label={SHARE_LABEL} testId="milestone-share" milestone={{ n, colours }} year={year} initialType="milestone" onOpen={markSeen} />
            )}
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
