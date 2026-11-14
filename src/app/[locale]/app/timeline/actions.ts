"use server";

import { pageGate } from "@/lib/conditions";
import { isIsoDate, TIMELINE_PAGE_DAYS, type TimelineDay } from "@/lib/journal/timeline";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readEntryPictures } from "@/lib/journal/pictures";

export type TimelinePage = { status: "ok"; days: TimelineDay[]; done: boolean } | { status: "error" };

// One page of the Timeline (get_timeline): TIMELINE_PAGE_DAYS days before
// `before` (the last day already shown), newest first. Moments only: the
// days with a moment, each with only its moments (migration 005; agreed
// with Mobile Dev). Previews only, never full bodies.
export async function loadTimeline(before: string | null, momentsOnly: boolean): Promise<TimelinePage> {
  if (before !== null && !isIsoDate(before)) return { status: "error" };
  // The flag needs migration 005: never sent where it isn't live (Production
  // before "timeline-moments-rpc" is met), a client calling this action
  // directly included.
  if (momentsOnly && pageGate("timeline-moments-rpc") === "hidden") return { status: "error" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error" };
  const { data, error } = await supabase.rpc("get_timeline", {
    p_before: before,
    p_limit: TIMELINE_PAGE_DAYS,
    ...(momentsOnly ? { p_moments_only: true } : {}),
  });
  if (error || !Array.isArray(data)) return { status: "error" };
  const days = data as TimelineDay[];
  // Pictures (035): each entry's thumbnails for the strip, signed for 5 minutes. Unreadable: the
  // list without them (never a failed page over a picture).
  if (pageGate("pictures-live") !== "hidden") {
    const ids = days.flatMap((d) => (Array.isArray(d.entries) ? d.entries.map((e) => e.id) : []));
    const pictures = await readEntryPictures(supabase, ids, { full: false });
    if (pictures) for (const d of days) for (const e of d.entries ?? []) {
      const list = pictures.get(e.id);
      if (list?.length) e.thumbs = list.map((p) => p.thumb);
    }
  }
  // The page's days' tags in one read (tags-live). A failed read: no chips, the days still show.
  if (pageGate("tags-live") !== "hidden" && days.length) {
    const { data: tagRows, error: tagError } = await supabase.from("check_in_tags").select("local_date, tag, created_at").in("local_date", days.map((d) => d.local_date)).order("created_at");
    if (!tagError) {
      const byDay = new Map<string, string[]>();
      for (const r of (tagRows ?? []) as { local_date: string; tag: string }[]) byDay.set(r.local_date, [...(byDay.get(r.local_date) ?? []), r.tag]);
      for (const d of days) d.tags = byDay.get(d.local_date) ?? [];
    }
  }
  return { status: "ok", days, done: days.length < TIMELINE_PAGE_DAYS };
}
