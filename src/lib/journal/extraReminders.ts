// Moodbow Plus: more daily reminders (specs/plus-more-reminders.md, UX 12 Nov). The rules
// the server enforces in update_extra_reminders (the Mobile Dev's migration 031); the form
// checks the same before sending, so a refusal is rare.
// PENDING SYNC: the source is the app repo's supabase/contracts/reminders.json (moodbow-app
// db/extra-reminders 586c90e: maxExtra 2, minGapMinutes 60, errors in this order). Check these
// by hand against it until then. It's synced with scripts/sync-contracts.mjs once 030 and 031
// are on the app's master, after the web takes 030's export contract in its own PR (UX 12 Nov);
// then this reads the synced file and these lines go.
export const EXTRA_REMINDERS = {
  maxExtra: 2,
  minGapMinutes: 60,
  errors: ["invalid", "too_many", "plus_required", "too_close"],
} as const;

export type ExtraReminderError = (typeof EXTRA_REMINDERS.errors)[number];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

// "HH:MM" from "HH:MM" or "HH:MM:SS" (get_me sends seconds); null if it isn't a time.
export function toHHMM(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.match(HHMM);
  return m ? `${m[1]}:${m[2]}` : null;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Minutes between two times of day, the short way round midnight (23:30 and 00:10: 40).
export function gapMinutes(a: string, b: string): number {
  const d = Math.abs(minutes(a) - minutes(b));
  return Math.min(d, 24 * 60 - d);
}

// The stored list as the page uses it: valid times only, "HH:MM", sorted, no repeats.
export function parseExtraTimes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(toHHMM).filter((t): t is string => t !== null))].sort();
}

// What the server would say about this list beside this main time (Plus aside, which only the
// server knows): null when it's fine.
export function checkExtraTimes(times: string[], main: string): Exclude<ExtraReminderError, "plus_required"> | null {
  const all = times.map(toHHMM);
  if (all.some((t) => t === null)) return "invalid";
  const list = [...new Set(all as string[])];
  if (list.length > EXTRA_REMINDERS.maxExtra) return "too_many";
  const others = [main, ...list];
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) if (gapMinutes(others[i], others[j]) < EXTRA_REMINDERS.minGapMinutes) return "too_close";
  }
  return null;
}

// The extras a new main time removed: the server drops any within the gap of it, and Me says
// so once per removed time (UX 12 Nov: "Removed your {time} reminder: …").
export function removedTimes(before: string[], after: string[]): string[] {
  return before.filter((t) => !after.includes(t));
}

// The server's error, as one of ours ("raise exception 'too_close'": the message is the code).
export function extraReminderError(message: string | undefined): ExtraReminderError | "generic" {
  const code = EXTRA_REMINDERS.errors.find((e) => message?.includes(e));
  return code ?? "generic";
}
