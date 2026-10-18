import { describe, expect, it } from "vitest";
import { bands, cardFileName, isMonth, monthBands, monthRange, MOOD_HEX } from "./moodbow";

// The spec's geometry (specs/m10-share-card.md): the cross-platform
// contract, the same numbers on the app (to 0.01 px).
const close = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 2);

describe("bands (decision 104)", () => {
  it("story, n = 5: gap 4, t = 56.8, r from 148.4 to 391.6", () => {
    const b = bands(5, "story");
    expect(b.gap).toBe(4);
    close(b.thickness, 56.8);
    close(b.radii[0], 148.4);
    close(b.radii[4], 391.6);
  });

  it("story, n = 15 (still 4 px gaps) and 16 (2 px)", () => {
    const b15 = bands(15, "story");
    expect(b15.gap).toBe(4);
    close(b15.thickness, 16.2667);
    close(b15.radii[14], 120 + 16.2667 / 2 + 14 * (16.2667 + 4));
    const b16 = bands(16, "story");
    expect(b16.gap).toBe(2);
    close(b16.thickness, 16.875);
    close(b16.radii[0], 128.4375);
    close(b16.radii[15], 411.5625);
  });

  it("story, n = 31: the outer edge stays exactly at R_out", () => {
    const b = bands(31, "story");
    close(b.thickness, 7.7419);
    close(b.radii[30] + b.thickness / 2, 420);
    close(b.radii[0] - b.thickness / 2, 120);
  });

  it("square, n = 5: t = 44.8, r from 122.4", () => {
    const b = bands(5, "square");
    close(b.thickness, 44.8);
    close(b.radii[0], 122.4);
    close(b.radii[4] + b.thickness / 2, 340);
  });
});

describe("month data", () => {
  it("only that month's check-ins, the earliest first, as mood colours; gaps skipped", () => {
    const rows = [
      { local_date: "2026-10-09", mood: 5 },
      { local_date: "2026-09-30", mood: 1 },
      { local_date: "2026-10-01", mood: 2 },
      { local_date: "2026-10-04", mood: 4 },
      { local_date: "2026-11-01", mood: 3 },
    ];
    expect(monthBands(rows, "2026-10")).toEqual([MOOD_HEX[1], MOOD_HEX[3], MOOD_HEX[4]]);
  });

  it("file name, month range, month check", () => {
    expect(cardFileName("2026-10")).toBe("moodbow-2026-10.png");
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02").to).toBe("2028-02-29");
    expect(monthRange("2026-12").to).toBe("2026-12-31");
    expect(isMonth("2026-10")).toBe(true);
    for (const bad of ["2026-13", "2026-1", "26-10", "2026-10-01", null]) expect(isMonth(bad), String(bad)).toBe(false);
  });
});
