// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COLOURS, PALETTE_COLOURS, paletteCss, type Tokens } from "./paletteColours";
import { PALETTE_KEY, PALETTE_PRE_PAINT, PALETTES, parsePalette, readPalette, writePalette } from "./palettes";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const LATER = "2027-11-11T12:00:00.000Z";
beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.palette;
});
afterEach(() => vi.restoreAllMocks());

describe("the stored palette: a name and the date Plus runs to", () => {
  it("a known palette before its date; past it, or anything else, the default", () => {
    expect(parsePalette(`dusk@${LATER}`, NOW)).toBe("dusk");
    expect(parsePalette("dusk@2026-11-10T00:00:00.000Z", NOW)).toBeNull();
    expect(parsePalette(`neon@${LATER}`, NOW)).toBeNull();
    expect(parsePalette("sea", NOW)).toBeNull();
    expect(parsePalette(null, NOW)).toBeNull();
  });
  it("writePalette keeps it with its date and applies it; null goes back to the default", () => {
    writePalette("sea", LATER);
    expect(window.localStorage.getItem(PALETTE_KEY)).toBe(`sea@${LATER}`);
    expect(document.documentElement.dataset.palette).toBe("sea");
    expect(readPalette(NOW)).toBe("sea");
    writePalette(null, null);
    expect(window.localStorage.getItem(PALETTE_KEY)).toBeNull();
    expect(document.documentElement.dataset.palette).toBeUndefined();
  });
  it("the pre-paint script: only a known palette whose date hasn't passed; never throws", () => {
    const run = () => new Function(PALETTE_PRE_PAINT)();
    window.localStorage.setItem(PALETTE_KEY, "sunrise@2999-01-01T00:00:00.000Z");
    run();
    expect(document.documentElement.dataset.palette).toBe("sunrise");
    delete document.documentElement.dataset.palette;
    window.localStorage.setItem(PALETTE_KEY, "sunrise@2000-01-01T00:00:00.000Z");
    run();
    expect(document.documentElement.dataset.palette).toBeUndefined();
    window.localStorage.setItem(PALETTE_KEY, "<script>@2999-01-01");
    run();
    expect(document.documentElement.dataset.palette).toBeUndefined();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run).not.toThrow();
  });
});

// WCAG 2 contrast.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const pairs = (t: Tokens): [string, string, number][] => [
  ...(["text", "muted", "accent"] as const).flatMap((fg) => (["bg", "surface", "pill"] as const).map((bg): [string, string, number] => [fg, bg, ratio(t[fg], t[bg])])),
  ["onAccent", "accent", ratio(t.onAccent, t.accent)],
];

describe("every text colour reaches 4.5:1 on what it sits on, in light and dark (UX, 11 Nov)", () => {
  for (const name of PALETTES) {
    for (const mode of ["light", "dark"] as const) {
      it(`${name}, ${mode}`, () => {
        for (const [fg, bg, r] of pairs(PALETTE_COLOURS[name][mode])) expect(r, `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("globals.css", () => {
  const css = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8").replace(/\r\n/g, "\n");
  it("holds exactly the generated palettes (regenerate after a colour change)", () => {
    const begin = css.indexOf("/* Moodbow Plus palettes");
    const end = css.indexOf("/* End of the Moodbow Plus palettes. */");
    expect(begin).toBeGreaterThan(-1);
    const block = css.slice(css.indexOf("\n", begin) + 1, end).trim();
    expect(block).toBe(paletteCss().trim());
  });
  it("on screen only: paper stays black on white, after the palettes", () => {
    expect(paletteCss().startsWith("@media screen {")).toBe(true);
    expect(css.indexOf("@media print")).toBeGreaterThan(css.indexOf("/* End of the Moodbow Plus palettes. */"));
  });
  it("the help card keeps the default colours, light and dark, which are the site's own", () => {
    expect(paletteCss()).toContain("[data-palette] [data-default-colours]");
    expect(css).toContain(`--surface: #352d43`);
    expect(DEFAULT_COLOURS.dark.surface).toBe("#352d43");
    expect(DEFAULT_COLOURS.light.border).toBe("#ece3da");
  });
});
