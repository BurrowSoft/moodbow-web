import { pageGate } from "@/lib/conditions";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type Client = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

// The tags a check-in card starts from (tags-live; the app's migration 029),
// read through RLS. null: tags are off here, or the day's couldn't be read.
// Then the field isn't shown at all: an empty one could replace tags it never
// saw when the person adds one.
export async function readCardTags(supabase: Client, date: string): Promise<{ initialTags: string[] | null; recentTags: string[] }> {
  if (pageGate("tags-live") === "hidden") return { initialTags: null, recentTags: [] };
  const [day, recent] = await Promise.all([
    supabase.from("check_in_tags").select("tag, created_at").eq("local_date", date).order("created_at"),
    supabase.rpc("my_recent_tags", { p_limit: 30 }),
  ]);
  if (day.error) return { initialTags: null, recentTags: [] };
  const names = (rows: unknown) => ((rows ?? []) as { tag?: unknown }[]).map((r) => r.tag).filter((t): t is string => typeof t === "string");
  return { initialTags: names(day.data), recentTags: recent.error ? [] : names(recent.data) };
}
