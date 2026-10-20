"use server";

import { pageGate } from "@/lib/conditions";
import { calendarMonth, type CalendarMonth } from "@/lib/journal/calendar";
import { isMonth, monthRange } from "@/lib/share/moodbow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CalendarResult = { status: "ok"; days: CalendarMonth } | { status: "error" };

// One month for the calendar (1.1 M): each day's mood, and whether it has an
// entry or a moment. Dates, moods and flags only, never text (RLS: own rows).
// Date ranges only, no user text in the request (decision 196).
export async function loadCalendarMonth(month: string): Promise<CalendarResult> {
  if (pageGate("calendar-live") === "hidden" || !isMonth(month)) return { status: "error" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error" };
  const { from, to } = monthRange(month);
  const [checkIns, entries] = await Promise.all([
    supabase.from("check_ins").select("local_date, mood").gte("local_date", from).lte("local_date", to),
    supabase.from("entries").select("entry_date, is_moment").gte("entry_date", from).lte("entry_date", to),
  ]);
  if (checkIns.error || entries.error) return { status: "error" };
  return {
    status: "ok",
    days: calendarMonth((checkIns.data ?? []) as { local_date: string; mood: number }[], (entries.data ?? []) as { entry_date: string; is_moment: boolean }[]),
  };
}
