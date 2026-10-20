// @vitest-environment node
import { describe, expect, it } from "vitest";
import fixture from "./cards-fixture.json";
import { chartGeometry, latestBands, milestoneFor } from "./cards";
import { MOOD_HEX, type CardFormat } from "./moodbow";

// The 1.1 cards against the shared fixture (decision 169): the app tests the
// same cases.
describe("chartGeometry (the shared fixture)", () => {
  for (const c of fixture.chart) {
    it(`${c.format}: ${JSON.stringify(c.moods)}`, () => {
      const g = chartGeometry(c.moods, c.format as CardFormat);
      expect(g.segments).toEqual(c.segments);
      expect(g.dots).toEqual(c.dots);
      expect(g.gradient).toEqual(c.gradient);
      expect(g.baseline).toEqual(c.baseline);
    });
  }
});

describe("milestoneFor (the shared fixture)", () => {
  it("the highest of 30, 100, 365 reached; none before 30", () => {
    for (const [days, milestone] of fixture.milestones) expect(milestoneFor(days as number), String(days)).toBe(milestone);
  });
});

describe("latestBands", () => {
  it("the latest 31 check-ins at most, earliest first, as mood colours", () => {
    // 40 days in date order (string dates sort as dates), given newest first.
    const rows = Array.from({ length: 40 }, (_, i) => ({ local_date: new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10), mood: (i % 5) + 1 }));
    const bands = latestBands([...rows].reverse());
    expect(bands).toHaveLength(31);
    expect(bands[0]).toBe(MOOD_HEX[rows[9].mood - 1]);
    expect(bands[30]).toBe(MOOD_HEX[rows[39].mood - 1]);
  });
});
