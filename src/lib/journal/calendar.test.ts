// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addDays, addMonths, calendarDate, calendarMonth, monthGrid, weekdayNames } from "./calendar";

describe("monthGrid (weeks from Monday)", () => {
  it("October 2026 starts on a Thursday: 3 blanks, 31 days, padded to whole weeks", () => {
    const g = monthGrid("2026-10");
    expect(g).toHaveLength(5);
    expect(g[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(g[4]).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", null]);
  });

  it("a February that starts on Monday fits in 4 weeks; leap years have the 29th", () => {
    expect(monthGrid("2021-02")).toHaveLength(4);
    expect(monthGrid("2024-02").flat()).toContain("2024-02-29");
    expect(monthGrid("2026-02").flat()).not.toContain("2026-02-29");
  });
});

describe("months and days", () => {
  it("across years and month ends", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });
});

describe("labels from Intl", () => {
  it("weekday headers start on Monday, with the full name for screen readers", () => {
    const w = weekdayNames("en-GB");
    expect(w.map((d) => d.long)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    expect(w[0].short).toBe("M");
  });

  it("a cell's date in words", () => {
    expect(calendarDate("2026-10-21", "en-GB")).toBe("Wednesday 21 October");
  });
});

describe("calendarMonth", () => {
  it("the mood, and an entry or a moment, per day; days with nothing are absent", () => {
    expect(
      calendarMonth(
        [
          { local_date: "2026-10-01", mood: 4 },
          { local_date: "2026-10-03", mood: 9 },
        ],
        [
          { entry_date: "2026-10-01", is_moment: false },
          { entry_date: "2026-10-02", is_moment: true },
        ],
      ),
    ).toEqual({
      "2026-10-01": { mood: 4, moment: false, entry: true },
      "2026-10-02": { mood: null, moment: true, entry: true },
    });
  });
});
