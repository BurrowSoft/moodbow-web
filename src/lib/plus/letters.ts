import { pageGate, type ConditionId, type PageGate } from "@/lib/conditions";
import { hasPlus, type EntitlementRow } from "./entitlements";

// Letters to future you are part of Moodbow Plus from the day they ship (Vitor, 14 Nov; UX's
// rulings in specs/1.3-offer-review-voice-taps.md §3). On the web they exist only once both
// switches are on: letters-live (1.2's own) and plus. If 1.2 ships first, letters wait for Plus.
// This is the feature's switch, never a per-person check: reading, opening on the day (Today's
// card, the Timeline's line), opening early, deleting and export never ask about Plus.
export function lettersGate(gate: (id: ConditionId) => PageGate = pageGate): PageGate {
  const own = gate("letters-live");
  const plus = gate("plus");
  if (own === "hidden" || plus === "hidden") return "hidden";
  return own === "live" && plus === "live" ? "live" : "draft";
}

// Writing a new letter is the one thing Plus decides, and the server checks it on every save.
// - "plus": Plus is active (trialing or active, inside its period: has_plus()'s rule).
// - "lapsed_once": Plus ended in the last 24 hours and no letter was created after it ended. A
//   draft in progress when Plus lapsed can be saved once (the ruling). The page never offers a
//   new draft then: only an editor opened while Plus was on can reach this.
// - "locked": anything else, a missing row included. The editor offers to copy the text instead.
// The database applies the identical rule in letter_save (moodbow-app 032_letters_plus.sql).
export type LetterWrite = "plus" | "lapsed_once" | "locked";
export const LAPSED_DRAFT_MS = 24 * 60 * 60 * 1000;

export function letterWrite(row: Pick<EntitlementRow, "status" | "current_period_end"> | null, wroteSinceLapse: boolean, now = Date.now()): LetterWrite {
  if (hasPlus(row, now)) return "plus";
  const end = row?.current_period_end ? new Date(row.current_period_end).getTime() : NaN;
  if (Number.isFinite(end) && end <= now && now - end < LAPSED_DRAFT_MS && !wroteSinceLapse) return "lapsed_once";
  return "locked";
}

