import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { flagsCrisis } from "@/lib/safety/crisis";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { namesGetHelp } from "./reflect";

type Client = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

// Your reflections (Insights → AI, decision 258; specs/insights-ai-split.md): the person's
// reflections, newest first by the reflection's own time (UX, 25 Nov), each with its entry's date and
// the reflection's first line. Each reflection also stays on its entry exactly as before: this only
// collects them.
// A crisis reply is listed as its date and a neutral word only: its line is null here, so its text
// never leaves the server for the list, not as text, a label or anything else (the Reviewer). Two
// checks, either is enough: it names the help button (namesGetHelp, the entry panel's own rule), or it
// holds a crisis keyword (the shared list, as the after-save check uses), in case a reply ever leaves
// the button out and echoes the person's words (the Reviewer, #423). A reflection whose entry is gone
// isn't listed (it would open nothing).
export const REFLECTIONS_PREVIEW = 3;
export const REFLECTIONS_PAGE = 20;
// See all's most at once (?shown=), so an address can't ask for every row there is.
export const REFLECTIONS_MAX = 500;
// Entries are read by id in groups this size (a GET's address holds the ids).
const ENTRY_IDS_PER_READ = 100;

export type ReflectionRow = { id: string; entryId: string; entryDate: string; line: string | null };

// The first line with text, trimmed; null for a crisis reply (or no text at all), which the list
// names with the neutral word. The whole body is checked, not only its first line.
export function reflectionLine(body: string): string | null {
  if (namesGetHelp(body) || flagsCrisis(body, CRISIS_KEYWORDS)) return null;
  return (
    body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? null
  );
}

// See all's ?shown=: a whole number of pages, at least one, at most REFLECTIONS_MAX.
export function shownOf(asked: unknown): number {
  const n = typeof asked === "string" && /^\d{1,4}$/.test(asked) ? Number(asked) : REFLECTIONS_PAGE;
  return Math.min(REFLECTIONS_MAX, Math.max(REFLECTIONS_PAGE, Math.ceil(n / REFLECTIONS_PAGE) * REFLECTIONS_PAGE));
}

// The newest `count`, and whether there are more. RLS: the person's own rows. null: a read failed
// (the page says so; never a partial list passed off as all of it).
export async function readReflections(supabase: Client, count: number): Promise<{ rows: ReflectionRow[]; more: boolean } | null> {
  const { data, error } = await supabase
    .from("ai_reflections")
    .select("id, entry_id, body, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(count + 1);
  if (error || !data) return null;
  const more = data.length > count;
  const page = (data as { id: string; entry_id: string; body: string }[]).slice(0, count);
  const ids = [...new Set(page.map((r) => r.entry_id))];
  const groups = Array.from({ length: Math.ceil(ids.length / ENTRY_IDS_PER_READ) }, (_, i) => ids.slice(i * ENTRY_IDS_PER_READ, (i + 1) * ENTRY_IDS_PER_READ));
  const reads = await Promise.all(groups.map((group) => supabase.from("entries").select("id, entry_date").in("id", group)));
  if (reads.some((r) => r.error || !r.data)) return null;
  const dates = new Map(reads.flatMap((r) => r.data as { id: string; entry_date: string }[]).map((e) => [e.id, e.entry_date]));
  const rows = page.flatMap((r) => {
    const entryDate = dates.get(r.entry_id);
    return entryDate ? [{ id: r.id, entryId: r.entry_id, entryDate, line: reflectionLine(r.body) }] : [];
  });
  return { rows, more };
}
