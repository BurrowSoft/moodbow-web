"use server";

import { isMonth, monthRange, type MonthCheckIn } from "@/lib/share/moodbow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MonthResult = { status: "ok"; checkIns: MonthCheckIn[] } | { status: "error" };

// One month's moods for "My month's moodbow" (M10): the date and mood only,
// nothing else leaves the database for the card (RLS: own rows).
export async function loadMonthCheckIns(month: string): Promise<MonthResult> {
  if (!isMonth(month)) return { status: "error" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error" };
  const { from, to } = monthRange(month);
  const { data, error } = await supabase.from("check_ins").select("local_date, mood").gte("local_date", from).lte("local_date", to);
  if (error) return { status: "error" };
  return { status: "ok", checkIns: (data ?? []) as MonthCheckIn[] };
}
