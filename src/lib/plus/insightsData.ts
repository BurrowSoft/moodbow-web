import type { InsightRow } from "@/lib/journal/insights";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

// Moodbow Plus's longer reads for Insights (Year, All time, More patterns), as
// the person themselves (RLS). In pages of 1,000, since all time can pass
// PostgREST's row limit. null: a read failed (the page's error state).
type Client = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
const PAGE = 1000;

export async function readCheckInsSince(supabase: Client, from: string | null, today: string): Promise<InsightRow[] | null> {
  const rows: InsightRow[] = [];
  for (let at = 0; ; at += PAGE) {
    let q = supabase.from("check_ins").select("local_date, mood, sleep_hours, stress, exercise_minutes").lte("local_date", today);
    if (from) q = q.gte("local_date", from);
    const { data, error } = await q.order("local_date").range(at, at + PAGE - 1);
    if (error) return null;
    rows.push(...((data ?? []) as InsightRow[]));
    if (!data || data.length < PAGE) return rows;
  }
}

// The days with an entry (More patterns' "days you wrote"): dates only, never a word of the text.
export async function readWrittenDays(supabase: Client, from: string | null, today: string): Promise<Set<string> | null> {
  const days = new Set<string>();
  for (let at = 0; ; at += PAGE) {
    let q = supabase.from("entries").select("entry_date").lte("entry_date", today);
    if (from) q = q.gte("entry_date", from);
    const { data, error } = await q.order("entry_date").range(at, at + PAGE - 1);
    if (error) return null;
    for (const r of data ?? []) if (typeof (r as { entry_date?: unknown }).entry_date === "string") days.add((r as { entry_date: string }).entry_date);
    if (!data || data.length < PAGE) return days;
  }
}

// "Dec 2025 – Nov 2026": the first and last month shown, in the browser's own names.
export function periodLine(firstStart: string, lastEnd: string, tag: string): string {
  const fmt = new Intl.DateTimeFormat(tag, { month: "short", year: "numeric", timeZone: "UTC" });
  const last = new Date(`${lastEnd}T00:00:00Z`);
  last.setUTCDate(0); // the day before lastEnd: the last month shown
  return fmt.formatRange(new Date(`${firstStart}T00:00:00Z`), last);
}
