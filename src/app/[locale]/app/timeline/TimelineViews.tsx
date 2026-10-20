"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { segment } from "@/lib/ui/journalLayout";
import { setViewCookie, type TimelineView } from "@/lib/journal/timelineView";

// List · Calendar on the Timeline (1.1 M): a segment, the selected one in
// rose. The choice is remembered on this device in a first-party cookie the
// server reads (UX, option 1), so the chosen view is the first one painted
// (no swap after hydration). Default List.
export function TimelineViews({ initialView, list, calendar }: { initialView: TimelineView; list: ReactNode; calendar: ReactNode }) {
  const t = useTranslations("timeline");
  const [view, setView] = useState(initialView);
  const choose = (v: TimelineView) => {
    setView(v);
    setViewCookie(v);
  };
  return (
    <>
      <div role="group" aria-label={t("timelineTitle")} className="mt-4 flex gap-2">
        {(["list", "calendar"] as const).map((v) => (
          <button key={v} type="button" data-testid={`timeline-view-${v}`} aria-pressed={view === v} onClick={() => choose(v)} className={segment(view === v)}>
            {t(v === "list" ? "timelineViewList" : "timelineViewCalendar")}
          </button>
        ))}
      </div>
      {view === "calendar" ? calendar : list}
    </>
  );
}
