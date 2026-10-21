"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { checkInErrorAction, parseCheckIn, sameCheckIn, type CheckIn, type CheckInError } from "@/lib/journal/checkIn";
import { readMe } from "@/lib/journal/me";
import { isDeadlineError } from "@/lib/supabase/deadline";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CheckInState = { status: "idle" } | { status: "saved"; checkIn: CheckIn } | { status: "error"; error: CheckInError; checkIn?: CheckIn };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLUMNS = "local_date, mood, sleep_hours, sleep_quality, exercise_minutes, stress, updated_at";

// Saves a check-in (upsert_check_in). The date is the profile's "today"
// from get_me (never the browser's), or the day an offline copy was made.
// expected_updated_at (the row the card was showing) makes an edit made
// meanwhile on another device a stale_write: the card then shows the latest
// version and asks to retry. Without one, a day that already has a check-in
// is a conflict: both versions go to the check-in conflict dialog.
export async function saveCheckIn(_prev: CheckInState, form: FormData): Promise<CheckInState> {
  const input = parseCheckIn(form);
  if (!input) return { status: "error", error: "invalid" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", error: "generic" };
  // Supabase not answering in time (a data deadline) is "unreachable": the
  // card keeps the check-in as a pending copy.
  const { me, unreachable } = await readMe(supabase);
  if (!me) return { status: "error", error: unreachable ? "unreachable" : "generic" };

  // A pending copy synced later names its own day; the card itself sends
  // today. The RPC rejects a future date (date_in_future).
  const sent = String(form.get("local_date") ?? "");
  const date = ISO_DATE.test(sent) ? sent : me.today;
  const expected = String(form.get("expected_updated_at") ?? "") || null;

  // A check-in made when the day had none (the card, or an offline copy)
  // has no version to lock against: it's saved insert-only (migration 012,
  // decision 209), so a check-in already there is never overwritten, not
  // even one saved on another device a moment ago. The database decides,
  // in the same statement (no read-then-write race).
  const { data, error } = await supabase.rpc("upsert_check_in", {
    p_date: date,
    p_mood: input.mood,
    p_sleep_hours: input.sleep_hours,
    p_sleep_quality: input.sleep_quality,
    p_exercise_minutes: input.exercise_minutes,
    p_stress: input.stress,
    p_expected_updated_at: expected,
    p_insert_only: expected === null,
  });
  if (error) {
    const action = checkInErrorAction(error.message);
    if (action.kind === "redirect") return redirect({ href: action.to, locale: await getLocale() });
    if (action.error === "stale" || action.error === "conflict") {
      const { data: latest, error: readError } = await supabase.from("check_ins").select(COLUMNS).eq("local_date", date).maybeSingle();
      const row = (latest as CheckIn | null) ?? undefined;
      // The day already holds exactly these values: this same save went
      // through before and only its answer was lost. Saved, not a conflict.
      if (row && sameCheckIn(row, input)) return { status: "saved", checkIn: row };
      // conflict: the day has another check-in. Without it to show, the
      // person can't choose (the dialog shows both): kept for a retry.
      if (action.error === "conflict" && !row) return { status: "error", error: isDeadlineError(readError) ? "unreachable" : "generic" };
      return { status: "error", error: action.error, checkIn: row };
    }
    return { status: "error", error: action.error };
  }
  return { status: "saved", checkIn: data as CheckIn };
}
