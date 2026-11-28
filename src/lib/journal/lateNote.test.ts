// @vitest-environment node
import { describe, expect, it } from "vitest";
import contract from "../../../content/contracts/late-note.json";
import { LATE_NOTE_RULES, lateNote, zonedDateHour } from "./lateNote";

// The late-night note (1.4 D): content/contracts/late-note.json (the app's, synced), first generated from the rules alone by
// scripts/gen-late-note-contract.mjs (fixed UTC offsets, no Intl), for moodbow-app's late-note.json.
describe("late-night note: the contract", () => {
  it("rules: 00:00-04:59, moods 1 and 2", () => {
    expect(LATE_NOTE_RULES).toEqual({ fromHour: 0, toHour: 4, moods: [1, 2] });
  });

  for (const c of contract.cases) {
    it(c.name, () => {
      expect(lateNote(c.mood, new Date(c.saved_at), c.zone, c.mark)).toEqual({ show: c.show, mark: c.mark_after });
    });
  }
});

describe("zonedDateHour", () => {
  it("the profile's zone; an unknown zone falls back to the device clock", () => {
    expect(zonedDateHour(new Date("2026-11-18T17:00:00Z"), "Asia/Bangkok")).toEqual({ date: "2026-11-19", hour: 0 });
    const d = new Date("2026-11-18T17:00:00Z");
    expect(zonedDateHour(d, "Not/AZone")).toEqual(zonedDateHour(d, null));
  });
});
