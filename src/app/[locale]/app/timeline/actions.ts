"use server";

import { isIsoDate, TIMELINE_PAGE_DAYS, type TimelineDay } from "@/lib/journal/timeline";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TimelinePage = { status: "ok"; days: TimelineDay[]; done: boolean } | { status: "error" };

// One page of the Timeline (get_timeline): TIMELINE_PAGE_DAYS days before
// `before` (the last day already shown), newest first. Moments only: the
// days with a moment, each with only its moments (migration 005; agreed
// with Mobile Dev). Previews only, never full bodies.
export async function loadTimeline(before: string | null, momentsOnly: boolean): Promise<TimelinePage> {
  if (before !== null && !isIsoDate(before)) return { status: "error" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error" };
  const { data, error } = await supabase.rpc("get_timeline", {
    p_before: before,
    p_limit: TIMELINE_PAGE_DAYS,
    ...(momentsOnly ? { p_moments_only: true } : {}),
  });
  if (error || !Array.isArray(data)) return { status: "error" };
  const days = data as TimelineDay[];
  return { status: "ok", days, done: days.length < TIMELINE_PAGE_DAYS };
}
