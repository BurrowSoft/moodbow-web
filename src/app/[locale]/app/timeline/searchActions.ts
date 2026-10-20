"use server";

import { pageGate } from "@/lib/conditions";
import { escapeLike, searchTerm, snippet, SEARCH_MAX_RESULTS, type Snippet } from "@/lib/journal/search";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Search your journal (1.1 L): entry text, the user's own rows (RLS), newest
// first, at most 50. The query arrives as this action's POST body and goes
// no further than the database: never a URL, a log, Sentry or storage.
// Only a one-line snippet per hit comes back, never the whole entry.
export type SearchHit = { id: string; date: string; isMoment: boolean; mood: number | null; snippet: Snippet };
export type SearchResult = { status: "ok"; hits: SearchHit[]; more: boolean } | { status: "error" };

export async function searchEntries(raw: string): Promise<SearchResult> {
  if (pageGate("search-live") === "hidden") return { status: "error" };
  const q = searchTerm(raw);
  if (!q) return { status: "error" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error" };
  // One more than shown, to know whether there are more ("the newest 50").
  const { data, error } = await supabase
    .from("entries")
    .select("id, entry_date, body, is_moment")
    .ilike("body", `%${escapeLike(q)}%`)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(SEARCH_MAX_RESULTS + 1);
  if (error) return { status: "error" };
  const rows = (data ?? []) as { id: string; entry_date: string; body: string; is_moment: boolean }[];
  const shown = rows.slice(0, SEARCH_MAX_RESULTS);
  // The days' moods, for the Timeline-style "date · mood" row (decision 161).
  const dates = [...new Set(shown.map((r) => r.entry_date))];
  const moodOf = new Map<string, number>();
  if (dates.length) {
    const { data: checkIns } = await supabase.from("check_ins").select("local_date, mood").in("local_date", dates);
    for (const c of (checkIns ?? []) as { local_date: string; mood: number }[]) moodOf.set(c.local_date, c.mood);
  }
  const hits: SearchHit[] = [];
  for (const r of shown) {
    const s = snippet(r.body, q);
    // The database matched it; if the snippet can't place it (a Unicode case
    // fold), show the entry's opening instead of dropping it.
    hits.push({ id: r.id, date: r.entry_date, isMoment: r.is_moment, mood: moodOf.get(r.entry_date) ?? null, snippet: s ?? { before: "", match: "", after: r.body.replace(/\s+/g, " ").slice(0, 80) } });
  }
  return { status: "ok", hits, more: rows.length > SEARCH_MAX_RESULTS };
}
