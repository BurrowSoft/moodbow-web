// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MOOD_COLOURS } from "./checkIn";
import { MOOD_HEX } from "../share/moodbow";

// "Sunrise" (decision 149): one set of mood colours everywhere, with an
// outline that keeps every circle ≥ 3:1 against its background.
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("mood colours", () => {
  it("are decision 149's, 1 → 5, the same in the picker/Timeline and on the share card", () => {
    expect(MOOD_HEX).toEqual(["#7F8CB8", "#A99BD1", "#E6C7D3", "#F4A77A", "#F3C24F"]);
    expect(MOOD_COLOURS.map((c) => c.match(/#[0-9a-f]{6}/i)![0].toUpperCase())).toEqual([...MOOD_HEX]);
  });

  it("the circles' outline (the muted token) is ≥ 3:1 on every surface, in both themes", () => {
    for (const [muted, surfaces] of [
      ["#6B6278", ["#FFFFFF", "#FBF6F1", "#F9EAEC"]],
      ["#C9C1D4", ["#352D43", "#2B2438", "#382C43"]],
    ] as const) {
      for (const bg of surfaces) expect(contrast(muted, bg), `${muted} on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });
});
