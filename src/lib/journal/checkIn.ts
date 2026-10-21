// The daily check-in (M4), the same rules as upsert_check_in (moodbow-app
// migration 002): mood 1–5 required; sleep 0–14 h in 0.5 steps with an
// optional quality; exercise minutes from fixed chips; stress 1–5. The
// server checks again; this keeps the form honest before it gets there.

export const MOODS = [1, 2, 3, 4, 5] as const;
export const SLEEP_QUALITIES = ["poor", "okay", "good"] as const;
export const EXERCISE_MINUTES = [0, 15, 30, 45, 60, 90] as const;
export const STRESS_LEVELS = [1, 2, 3, 4, 5] as const;
// The mood colours, Awful → Great ("Sunrise", decision 149): from the
// colour-map contract, in valueColours.ts.
export { MOOD_COLOURS, MOOD_DOT_OUTLINE } from "./valueColours";
export const SLEEP_HOURS = Array.from({ length: 29 }, (_, i) => i / 2); // 0, 0.5 … 14
// Where the sleep stepper starts from empty (the app's sleepStart).
export const SLEEP_START = 7;

export type SleepQuality = (typeof SLEEP_QUALITIES)[number];

export type CheckIn = {
  local_date: string;
  mood: number;
  sleep_hours: number | null;
  sleep_quality: SleepQuality | null;
  exercise_minutes: number | null;
  stress: number | null;
  updated_at: string;
};

export type CheckInInput = Omit<CheckIn, "local_date" | "updated_at">;

const optionalNumber = (raw: FormDataEntryValue | null): number | null => {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
};

// Parses the card's form fields; null when anything is out of range.
export function parseCheckIn(form: FormData): CheckInInput | null {
  const mood = Number(form.get("mood"));
  const sleepHours = optionalNumber(form.get("sleep_hours"));
  const sleepQuality = (form.get("sleep_quality") as string | null) || null;
  const exercise = optionalNumber(form.get("exercise_minutes"));
  const stress = optionalNumber(form.get("stress"));
  const ok =
    (MOODS as readonly number[]).includes(mood) &&
    (sleepHours === null || SLEEP_HOURS.includes(sleepHours)) &&
    (sleepQuality === null || (SLEEP_QUALITIES as readonly string[]).includes(sleepQuality)) &&
    (exercise === null || (EXERCISE_MINUTES as readonly number[]).includes(exercise)) &&
    (stress === null || (STRESS_LEVELS as readonly number[]).includes(stress));
  if (!ok) return null;
  return { mood, sleep_hours: sleepHours, sleep_quality: sleepQuality as SleepQuality | null, exercise_minutes: exercise, stress };
}

// True when a stored row holds exactly these values (numeric columns may
// come back as strings).
export function sameCheckIn(row: CheckIn, input: CheckInInput): boolean {
  const num = (v: number | string | null) => (v === null ? null : Number(v));
  return (
    num(row.mood) === input.mood &&
    num(row.sleep_hours) === input.sleep_hours &&
    (row.sleep_quality ?? null) === input.sleep_quality &&
    num(row.exercise_minutes) === input.exercise_minutes &&
    num(row.stress) === input.stress
  );
}

// The RPC's error codes (supabase/contracts/errors.md) → what the card does.
// invalid: the values themselves were refused (invalid_value, or a form this
// file rejects); a retry can never succeed. generic: anything else (the
// network, an outage), which may. unreachable: Supabase never answered (a
// data deadline, lib/supabase/deadline): the card keeps the check-in as a
// pending copy, like a dropped connection.
export type CheckInError = "dateInFuture" | "stale" | "invalid" | "unreachable" | "generic";
export type CheckInErrorAction = { kind: "error"; error: CheckInError } | { kind: "redirect"; to: "/consent" | "/sign-in" };

export function checkInErrorAction(message: string): CheckInErrorAction {
  if (message.includes("consent_required")) return { kind: "redirect", to: "/consent" };
  if (message.includes("not_authenticated")) return { kind: "redirect", to: "/sign-in" };
  if (message.includes("date_in_future")) return { kind: "error", error: "dateInFuture" };
  if (message.includes("stale_write")) return { kind: "error", error: "stale" };
  if (message.includes("invalid_value")) return { kind: "error", error: "invalid" };
  // postgrest-js's answer to an aborted request (lib/supabase/deadline
  // isDeadlineError; not imported: this file is in the browser bundle too).
  if (message.startsWith("AbortError")) return { kind: "error", error: "unreachable" };
  return { kind: "error", error: "generic" };
}
