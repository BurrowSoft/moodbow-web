"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { dialogButton } from "@/components/Dialog";
import { localKey } from "@/lib/localData";
import { JOURNAL_CARD } from "@/lib/ui/journalLayout";

const listeners = new Set<() => void>();
const subscribeHidden = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const hiddenFor = (key: string) => {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

// The season's mark: Not now on the Year card hides it until the season ends (UX, 19 Nov: a
// look-back isn't for everyone, a grief year say). Kept across sign-out, as milestone-seen: no
// re-offer after signing back in; deleting the account removes it (localData's wipe).
export const yearCardHiddenKey = (uid: string, year: number) => localKey("year-card-hidden", uid, String(year));

// Today's card for Your year in Moodbow (1.4 A): 1 December to 31 January, never on a flagged day
// (the page decides). isNew: a small "New" label its first week, 1 to 7 December, read before the
// title. Open goes to the year; Not now hides it for the season (the year stays in Insights).
// `query` carries a Preview's ?today= (lib/journal/previewToday); it's empty everywhere else.
export function YearTodayCard({ uid, year, query, isNew = false }: { uid: string; year: number; query: string; isNew?: boolean }) {
  const t = useTranslations("year");
  const tb = useTranslations("toolbox");
  const key = yearCardHiddenKey(uid, year);
  const hidden = useSyncExternalStore(subscribeHidden, () => hiddenFor(key), () => false);
  const notNow = useCallback(() => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // storage unavailable: hidden until the page reloads
    }
    listeners.forEach((cb) => cb());
    // The card goes with its button: focus to Today's heading, not the page (as the other cards).
    document.getElementById("today-title")?.focus();
  }, [key]);
  if (hidden) return null;

  return (
    <section aria-labelledby="year-card-title" data-testid="year-today-card" className={JOURNAL_CARD}>
      <h2 id="year-card-title" className="flex flex-wrap items-center gap-x-[8px] gap-y-[4px] text-lg font-medium text-text">
        {isNew && (
          <span data-testid="year-today-new" className="rounded-full border border-accent px-[8px] text-sm font-medium text-accent">
            {t("new")}
          </span>
        )}
        <span className="min-w-0 [overflow-wrap:anywhere]">{t("title")}</span>
      </h2>
      <p className="mt-1 text-muted">{t("todayLine", { year })}</p>
      <div className="mt-3 flex flex-wrap gap-[12px]">
        <Link
          href={`/app/year${query}`}
          data-count="year_review_open"
          data-testid="year-today-open"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-[24px] font-medium text-on-accent hover:bg-accent-hover"
        >
          {t("open")}
        </Link>
        <button type="button" data-testid="year-today-not-now" onClick={notNow} className={dialogButton()}>
          {tb("notNow")}
        </button>
      </div>
    </section>
  );
}
