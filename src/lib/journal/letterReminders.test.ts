import { describe, expect, it } from "vitest";
import { daysUntil, DEFAULT_REMINDERS, headsUpFits, opensOn, remindersValid } from "./letterReminders";

const TODAY = "2026-11-14";
const r = (days_before: number, time = "09:00", on = true) => ({ days_before, time, on });

describe("opensOn: as the server adds months", () => {
  it("plain months, and the month-end clamp", () => {
    expect(opensOn(TODAY, 1)).toBe("2026-12-14");
    expect(opensOn(TODAY, 12)).toBe("2027-11-14");
    expect(opensOn("2026-01-31", 1)).toBe("2026-02-28");
    expect(opensOn("2027-12-31", 3)).toBe("2028-03-31");
  });
  it("daysUntil", () => expect(daysUntil(TODAY, "2026-12-14")).toBe(30));
});

describe("remindersValid: letter_save's rule (033)", () => {
  const opens = opensOn(TODAY, 1); // 30 days away
  it("the default, an empty list, and up to 3 heads-ups", () => {
    expect(remindersValid(DEFAULT_REMINDERS, TODAY, opens)).toBe(true);
    expect(remindersValid([], TODAY, opens)).toBe(true);
    expect(remindersValid([r(0), r(1, "20:30"), r(7, "08:00", false), r(29)], TODAY, opens)).toBe(true);
  });
  it("refused: 5 entries, a repeated day, a heads-up on or before today, a bad time, an extra key", () => {
    expect(remindersValid([r(0), r(1), r(2), r(3), r(4)], TODAY, opens)).toBe(false);
    expect(remindersValid([r(1), r(1)], TODAY, opens)).toBe(false);
    expect(remindersValid([r(30)], TODAY, opens)).toBe(false);
    expect(remindersValid([r(0, "9:00")], TODAY, opens)).toBe(false);
    expect(remindersValid([r(0, "09:00:00")], TODAY, opens)).toBe(false);
    expect(remindersValid([{ ...r(0), note: "x" } as never], TODAY, opens)).toBe(false);
    expect(remindersValid([r(1.5)], TODAY, opens)).toBe(false);
  });
  it("headsUpFits: 1 day up to the day before it opens", () => {
    expect(headsUpFits(1, TODAY, opens)).toBe(true);
    expect(headsUpFits(29, TODAY, opens)).toBe(true);
    expect(headsUpFits(30, TODAY, opens)).toBe(false);
    expect(headsUpFits(0, TODAY, opens)).toBe(false);
  });
});
