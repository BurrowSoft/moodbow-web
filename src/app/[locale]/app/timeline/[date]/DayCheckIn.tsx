"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CheckIn } from "@/lib/journal/checkIn";
import { CheckInCard } from "../../CheckInCard";

// A past day's check-in in the day view: the card itself when there is one;
// otherwise "No check-in this day" and "Add a check-in", which opens it.
export function DayCheckIn({ initial, uid, date, dateLocaleTag }: { initial: CheckIn | null; uid: string; date: string; dateLocaleTag: string }) {
  const t = useTranslations("timeline");
  const [adding, setAdding] = useState(false);
  if (initial || adding) return <CheckInCard initial={initial} uid={uid} today={date} dateLocaleTag={dateLocaleTag} />;
  return (
    <div className="rounded-3xl border border-dashed border-border p-6" data-testid="day-no-checkin">
      <p className="text-muted">{t("dayNoCheckin")}</p>
      <button type="button" data-testid="day-add-checkin" onClick={() => setAdding(true)} className="mt-3 font-medium text-accent underline underline-offset-4">
        {t("dayAddCheckin")}
      </button>
    </div>
  );
}
