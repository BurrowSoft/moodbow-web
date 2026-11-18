import contract from "./lateNote.contract.json";

// The gentle late-night note (1.4 D, specs/1.4-features.md §D; late-note-live; the cases in
// lateNote.contract.json, for moodbow-app supabase/contracts/late-note.json). A check-in the
// person saves from the card between 00:00 and 04:59 in their PROFILE's time zone (UX, 19 Nov:
// one clock everywhere), with one of the two lowest moods, shows one soft line under the saved
// check-in, with the help button. At most once a night (the save's date in that zone), per user.
// A save made offline counts (the person is there); a queued copy syncing later never does.
// Never a notification; nothing about it is sent, stored on the server or counted.
export const LATE_NOTE_RULES = contract.rules as { fromHour: number; toHour: number; moods: number[] };

// The save's date and hour in the zone; an unknown zone: the device's own clock.
export function zonedDateHour(savedAt: Date, zone: string | null | undefined): { date: string; hour: number } {
  try {
    if (zone) {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(savedAt);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
      return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
    }
  } catch {
    // RangeError: not a zone this browser knows
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${savedAt.getFullYear()}-${pad(savedAt.getMonth() + 1)}-${pad(savedAt.getDate())}`, hour: savedAt.getHours() };
}

// mark: the night it last showed for this person (YYYY-MM-DD), or null. show: this save shows it;
// mark: what to keep after (unchanged when it doesn't show).
export function lateNote(mood: number | null | undefined, savedAt: Date, zone: string | null | undefined, mark: string | null): { show: boolean; mark: string | null } {
  if (typeof mood !== "number" || !LATE_NOTE_RULES.moods.includes(mood)) return { show: false, mark };
  const { date, hour } = zonedDateHour(savedAt, zone);
  if (hour < LATE_NOTE_RULES.fromHour || hour > LATE_NOTE_RULES.toHour || mark === date) return { show: false, mark };
  return { show: true, mark: date };
}

// The mark lives in this browser, per user, and goes at sign-out (the card's handler). Storage
// unavailable: as no mark (showing it again is gentler than never). An mb:<kind>:<uid> key, so
// every per-user wipe (localData.ts: a gone account, decision 85) takes it too (the Reviewer, #366).
export const lateNoteKey = (uid: string) => `mb:lateNote:${uid}`;
export function claimLateNote(uid: string, mood: number | null | undefined, savedAt: Date, zone: string | null | undefined): boolean {
  let mark: string | null = null;
  try {
    mark = window.localStorage.getItem(lateNoteKey(uid));
  } catch {
    mark = null;
  }
  const result = lateNote(mood, savedAt, zone, mark);
  if (result.show) {
    try {
      window.localStorage.setItem(lateNoteKey(uid), result.mark ?? "");
    } catch {
      // storage blocked: shown anyway
    }
  }
  return result.show;
}
