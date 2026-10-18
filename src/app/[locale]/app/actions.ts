"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { checkInErrorAction, parseCheckIn, type CheckIn, type CheckInError } from "@/lib/journal/checkIn";
import { getMe } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CheckInState = { status: "idle" } | { status: "saved"; checkIn: CheckIn } | { status: "error"; error: CheckInError; checkIn?: CheckIn };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLUMNS = "local_date, mood, sleep_hours, sleep_quality, exercise_minutes, stress, updated_at";

// Saves a check-in (upsert_check_in). The date is the profile's "today"
// from get_me (never the browser's), or the day an offline copy was made.
// expected_updated_at (the row the card was showing) makes an edit made
// meanwhile on another device a stale_write: the card then shows the latest
// version and asks to retry.
export async function saveCheckIn(_prev: CheckInState, form: FormData): Promise<CheckInState> {
  const input = parseCheckIn(form);
  if (!input) return { status: "error", error: "generic" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", error: "generic" };
  const me = await getMe(supabase);
  if (!me) return { status: "error", error: "generic" };

  // A pending copy synced later names its own day; the card itself sends
  // today. The RPC rejects a future date (date_in_future).
  const sent = String(form.get("local_date") ?? "");
  const date = ISO_DATE.test(sent) ? sent : me.today;
  const expected = String(form.get("expected_updated_at") ?? "") || null;
  const { data, error } = await supabase.rpc("upsert_check_in", {
    p_date: date,
    p_mood: input.mood,
    p_sleep_hours: input.sleep_hours,
    p_sleep_quality: input.sleep_quality,
    p_exercise_minutes: input.exercise_minutes,
    p_stress: input.stress,
    p_expected_updated_at: expected,
  });
  if (error) {
    const action = checkInErrorAction(error.message);
    if (action.kind === "redirect") return redirect({ href: action.to, locale: await getLocale() });
    if (action.error === "stale") {
      const { data: latest } = await supabase.from("check_ins").select(COLUMNS).eq("local_date", date).maybeSingle();
      return { status: "error", error: "stale", checkIn: (latest as CheckIn | null) ?? undefined };
    }
    return { status: "error", error: action.error };
  }
  return { status: "saved", checkIn: data as CheckIn };
}
