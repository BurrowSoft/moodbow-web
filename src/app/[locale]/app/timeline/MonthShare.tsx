"use client";

import { useEffect, useState } from "react";
import { MIN_CHECK_INS } from "@/lib/share/moodbow";
import { ShareMonth } from "../insights/ShareMonth";
import { loadMonthCheckIns } from "../insights/shareActions";

// The message key for the trigger (the share flow translates it).
const SHARE_LABEL = "shareThisMonth" as const;

// "Share this month" in a Timeline month header (decision 161): the same
// share flow as Insights, for that month. Shown only when the month has
// enough check-ins for a card (MIN_CHECK_INS); otherwise nothing (hidden,
// not disabled). The count comes from the month itself, not from the days
// loaded so far (a month can span pages; Moments shows only some days).
export function MonthShare({ month, dateLocaleTag }: { month: string; dateLocaleTag: string }) {
  const [enough, setEnough] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadMonthCheckIns(month)
      .then((result) => {
        if (!cancelled && result.status === "ok") setEnough(result.checkIns.filter((c) => c.mood >= 1 && c.mood <= 5).length >= MIN_CHECK_INS);
      })
      .catch(() => {
        // offline: no link; Insights still has the share
      });
    return () => {
      cancelled = true;
    };
  }, [month]);
  if (!enough) return null;
  return <ShareMonth month={month} dateLocaleTag={dateLocaleTag} label={SHARE_LABEL} asLink testId={`timeline-share-${month}`} />;
}
