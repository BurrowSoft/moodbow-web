"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { segment } from "@/lib/ui/journalLayout";

// List · Calendar on the Timeline (1.1 M): a segment, the selected one in
// rose; the choice is remembered on this device only (a convenience: if
// storage is blocked it's List every time). Default List.

export type TimelineView = "list" | "calendar";
export const VIEW_KEY = "moodbow:timeline-view";

const listeners = new Set<() => void>();
function readView(): TimelineView {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "calendar" ? "calendar" : "list";
  } catch {
    return "list";
  }
}
function writeView(view: TimelineView) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // blocked storage: remembered for this page only
    memory = view;
  }
  listeners.forEach((l) => l());
}
let memory: TimelineView | null = null;
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export function TimelineViews({ list, calendar }: { list: ReactNode; calendar: ReactNode }) {
  const t = useTranslations("timeline");
  const view = useSyncExternalStore(subscribe, () => memory ?? readView(), () => "list" as TimelineView);
  return (
    <>
      <div role="group" aria-label={t("timelineTitle")} className="mt-4 flex gap-2">
        {(["list", "calendar"] as const).map((v) => (
          <button key={v} type="button" data-testid={`timeline-view-${v}`} aria-pressed={view === v} onClick={() => writeView(v)} className={segment(view === v)}>
            {t(v === "list" ? "timelineViewList" : "timelineViewCalendar")}
          </button>
        ))}
      </div>
      {view === "calendar" ? calendar : list}
    </>
  );
}
