"use server";

import { pageGate } from "@/lib/conditions";
import { searchTerm, snippet, SEARCH_MAX_RESULTS, type Snippet } from "@/lib/journal/search";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Search your journal (1.1 L): entry text, the user's own rows (RLS), newest
// first, at most 50. The query arrives as this action's POST body and goes
// no further than the database: never a URL, a log, Sentry or storage.
// Only a one-line snippet per hit comes back, never the whole entry.
export type SearchHit = { id: string; date: string; isMoment: boolean; mood: number | null; snippet: Snippet };
// tagDays: the days with a tag that matches (tags-live; UX, 11 Nov), newest first.
export type TagDayHit = { date: string; mood: number | null; tags: string[] };
export type SearchResult = { status: "ok"; hits: SearchHit[]; more: boolean; tagDays?: TagDayHit[] } | { status: "error" };

export async function searchEntries(raw: string): Promise<SearchResult> {
  if (pageGate("search-live") === "hidden") return { status: "error" };
  const q = searchTerm(raw);
  if (!q) return { status: "error" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error" };
  // search_entries (moodbow-app migration 010, security invoker so RLS
  // applies): the raw text in the POST body, never a URL (decision 196); the
  // function escapes % _ and \ itself and orders newest first. One more than
  // shown, to know whether there are more ("the newest 50").
  const { data, error } = await supabase.rpc("search_entries", { p_q: q, p_limit: SEARCH_MAX_RESULTS + 1 });
  if (error) return { status: "error" };
  const rows = (data ?? []) as { id: string; entry_date: string; body: string; is_moment: boolean }[];
  const shown = rows.slice(0, SEARCH_MAX_RESULTS);
  // Days whose tags match (a failed read: no tag days, the entries still show).
  // search_tags (the app's migration 029, security invoker), as search_entries:
  // the text in the POST body, never a URL (decision 196), newest first.
  const tagged = new Map<string, string[]>();
  if (pageGate("tags-live") !== "hidden") {
    const { data: tagRows } = await supabase.rpc("search_tags", { p_q: q, p_limit: SEARCH_MAX_RESULTS * 5 });
    const valid = (Array.isArray(tagRows) ? tagRows : []).filter((r): r is { local_date: string; tag: string } => typeof r?.local_date === "string" && typeof r?.tag === "string");
    for (const r of valid) {
      if (!tagged.has(r.local_date) && tagged.size >= SEARCH_MAX_RESULTS) continue;
      tagged.set(r.local_date, [...(tagged.get(r.local_date) ?? []), r.tag]);
    }
  }
  // The days' moods, for the Timeline-style "date · mood" row (decision 161).
  const dates = [...new Set([...shown.map((r) => r.entry_date), ...tagged.keys()])];
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
  const tagDays = [...tagged].map(([date, tags]) => ({ date, mood: moodOf.get(date) ?? null, tags }));
  return { status: "ok", hits, more: rows.length > SEARCH_MAX_RESULTS, ...(tagged.size ? { tagDays } : {}) };
}
