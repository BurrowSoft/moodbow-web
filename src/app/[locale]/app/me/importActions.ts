"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { EXERCISE_MINUTES, SLEEP_HOURS, SLEEP_QUALITIES } from "@/lib/journal/checkIn";
import { MAX_ENTRY_CHARS } from "@/lib/journal/entry";
import { getMe } from "@/lib/journal/me";
import { IMPORT_BATCH } from "@/lib/import/journalImport";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Import from another journal (1.1 K): one batch of the plan the person
// confirmed in the browser. Never overwriting: what's already there is
// counted as skipped and left alone. The rows come from the browser, so
// they're checked again here; no note text is logged, and nothing about
// the file reaches the server. Errors carry counts only.

// written: what this batch actually added (the days, or the entry ids), so
// the summary and the crisis line count only real writes (reviewer #92 B5).
export type ImportBatchResult = { status: "ok"; written: string[]; skipped: number } | { status: "error" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toSignIn = async () => redirect({ href: "/sign-in", locale: await getLocale() });

async function signedIn() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return toSignIn();
  const me = await getMe(supabase);
  return me ? { supabase, today: me.today } : null;
}

// Days' moods: a day that already has a check-in keeps ours (M5: its notes
// still come in through importEntries).
type ImportCheckIn = { date: string; mood: number; sleep_hours?: number; sleep_quality?: string; exercise_minutes?: number; stress?: number };

// The other values, when there: the check-in's own rules (as the form and
// upsert_check_in), checked again because the rows come from the browser.
const extrasOk = (d: ImportCheckIn) =>
  (d.sleep_hours === undefined || (SLEEP_HOURS as number[]).includes(d.sleep_hours)) &&
  (d.sleep_quality === undefined || (SLEEP_QUALITIES as readonly string[]).includes(d.sleep_quality)) &&
  (d.exercise_minutes === undefined || (EXERCISE_MINUTES as readonly number[]).includes(d.exercise_minutes)) &&
  (d.stress === undefined || (Number.isInteger(d.stress) && d.stress >= 1 && d.stress <= 5));

export async function importCheckIns(days: ImportCheckIn[]): Promise<ImportBatchResult> {
  if (!Array.isArray(days) || days.length === 0 || days.length > IMPORT_BATCH) return { status: "error" };
  const ctx = await signedIn();
  if (!ctx) return { status: "error" };
  const { supabase, today } = ctx;
  if (!days.every((d) => typeof d?.date === "string" && ISO.test(d.date) && d.date <= today && Number.isInteger(d.mood) && d.mood >= 1 && d.mood <= 5 && extrasOk(d))) return { status: "error" };
  const { data: existing, error } = await supabase.from("check_ins").select("local_date").in("local_date", days.map((d) => d.date));
  if (error) return { status: "error" };
  const have = new Set((existing ?? []).map((r) => (r as { local_date: string }).local_date));
  const written: string[] = [];
  for (const d of days) {
    if (have.has(d.date)) continue;
    const { error: writeError } = await supabase.rpc("upsert_check_in", {
      p_date: d.date,
      p_mood: d.mood,
      // Our own CSV export's values (1.1 P); none from other files.
      p_sleep_hours: d.sleep_hours ?? null,
      p_sleep_quality: d.sleep_quality ?? null,
      p_exercise_minutes: d.exercise_minutes ?? null,
      p_stress: d.stress ?? null,
      // No version: a new day. Read just above, so it isn't there.
      p_expected_updated_at: null,
    });
    if (writeError) return { status: "error" };
    written.push(d.date);
  }
  return { status: "ok", written, skipped: days.length - written.length };
}

// Notes as entries, with the ids the browser derived from the file (H1:
// UUIDv5), so a re-import finds them all and writes nothing. In the order
// given (date, then time), so the day's entries keep the file's order.
export async function importEntries(entries: { id: string; date: string; body: string; isMoment?: boolean }[]): Promise<ImportBatchResult> {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > IMPORT_BATCH) return { status: "error" };
  const ctx = await signedIn();
  if (!ctx) return { status: "error" };
  const { supabase, today } = ctx;
  if (
    !entries.every(
      (e) => typeof e?.id === "string" && UUID.test(e.id) && typeof e.date === "string" && ISO.test(e.date) && e.date <= today && typeof e.body === "string" && e.body.trim() !== "" && e.body.length <= MAX_ENTRY_CHARS,
    )
  )
    return { status: "error" };
  const { data: existing, error } = await supabase.from("entries").select("id").in("id", entries.map((e) => e.id));
  if (error) return { status: "error" };
  const have = new Set((existing ?? []).map((r) => (r as { id: string }).id));
  const written: string[] = [];
  for (const e of entries) {
    if (have.has(e.id)) continue;
    const { error: writeError } = await supabase.rpc("save_entry", {
      p_id: e.id,
      p_date: e.date,
      p_body: e.body,
      // Our own CSV export's moment column (1.1 P); false from other files.
      p_is_moment: e.isMoment === true,
      // New: read just above, so it isn't there (save_entry would otherwise update it).
      p_expected_updated_at: null,
    });
    if (writeError) return { status: "error" };
    written.push(e.id);
  }
  return { status: "ok", written, skipped: entries.length - written.length };
}
