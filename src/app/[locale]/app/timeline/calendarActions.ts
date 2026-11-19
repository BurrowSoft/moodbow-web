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
  const pictures = pageGate("pictures-live") !== "hidden";
  const [checkIns, entries] = await Promise.all([
    supabase.from("check_ins").select("local_date, mood").gte("local_date", from).lte("local_date", to),
    supabase.from("entries").select(pictures ? "id, entry_date, is_moment" : "entry_date, is_moment").gte("entry_date", from).lte("entry_date", to),
  ]);
  if (checkIns.error || entries.error) return { status: "error" };
  const rows = (entries.data ?? []) as unknown as { id?: string; entry_date: string; is_moment: boolean }[];
  // Pictures (035): which of the month's entries have any (ids only, own rows by RLS). Unreadable:
  // no camera marks, the rest of the month as before.
  let withPictures = new Set<string>();
  if (pictures) {
    const ids = rows.map((r) => r.id).filter((id): id is string => typeof id === "string");
    if (ids.length > 0) {
      const read = await supabase.from("entry_pictures").select("entry_id").in("entry_id", ids);
      if (!read.error) withPictures = new Set(((read.data ?? []) as { entry_id: string }[]).map((r) => r.entry_id));
    }
  }
  return {
    status: "ok",
    days: calendarMonth((checkIns.data ?? []) as { local_date: string; mood: number }[], rows, withPictures),
  };
}
