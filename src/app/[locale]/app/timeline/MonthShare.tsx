"use client";

import { useEffect, useState } from "react";
import { MIN_CHECK_INS } from "@/lib/share/moodbow";
import { ShareMonth } from "../insights/ShareMonth";
import { loadMonthCheckIns } from "../insights/shareActions";

// The message key for the trigger (the share flow translates it).
const SHARE_LABEL = "shareThisMonth" as const;

// Each month's check-in count, asked once per Timeline list (the list owns
// the map, so coming back to the Timeline asks again and a new check-in
// counts; reviewer #63). A failed ask is dropped, so a later header retries.
export type MonthCounts = Map<string, Promise<number>>;
function monthCount(counts: MonthCounts, month: string): Promise<number> {
  let count = counts.get(month);
  if (!count) {
    count = loadMonthCheckIns(month).then((result) => {
      if (result.status !== "ok") throw new Error("count");
      return result.checkIns.filter((c) => c.mood >= 1 && c.mood <= 5).length;
    });
    count.catch(() => counts.delete(month));
    counts.set(month, count);
  }
  return count;
}

// "Share this month" in a Timeline month header (decision 161): the same
// share flow as Insights, for that month. Shown only when the month has
// enough check-ins for a card (MIN_CHECK_INS); otherwise nothing (hidden,
// not disabled). The count comes from the month itself, not from the days
// loaded so far (a month can span pages; Moments shows only some days).
export function MonthShare({ month, dateLocaleTag, counts, year = null }: { month: string; dateLocaleTag: string; counts: MonthCounts; year?: number | null }) {
  const [enough, setEnough] = useState(false);
  useEffect(() => {
    let cancelled = false;
    monthCount(counts, month)
      .then((n) => {
        if (!cancelled) setEnough(n >= MIN_CHECK_INS);
      })
      .catch(() => {
        // offline: no link; Insights still has the share
      });
    return () => {
      cancelled = true;
    };
  }, [counts, month]);
  if (!enough) return null;
  return <ShareMonth month={month} dateLocaleTag={dateLocaleTag} label={SHARE_LABEL} asLink testId={`timeline-share-${month}`} year={year} />;
}
