// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Colour roles (decision 150, specs/colour-roles.md §2–3): Moodbow's voice and
// the UI accent are one rose family, ≥ 4.5:1; errors carry an icon. (The
// value colours, §1, follow with the shared colour-map.json contract.)
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("colour roles", () => {
  it("Moodbow's voice is the brand accent (one rose family) on a tint of it, ≥ 4.5:1 in both themes", () => {
    const css = readFileSync(join("src", "app", "globals.css"), "utf8");
    const count = (needle: string) => css.split(needle).length - 1;
    expect(count("--voice: var(--accent);")).toBe(3);
    expect(css).toContain("--voice-surface: #fbeff3;");
    expect(count("--accent: #d88aa6;")).toBe(2);
    expect(count("--voice-surface: color-mix(in srgb, var(--accent) 6%, var(--surface));")).toBe(2);
    const mix = (a: string, b: string, t: number) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, "0")).join("");
    // Light: the deep rose on its tint; dark: #D88AA6 on 6% of it over the card.
    expect(contrast("#A8456A", "#FBEFF3")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#D88AA6", mix("#D88AA6", "#352D43", 0.06))).toBeGreaterThanOrEqual(4.5);
    // Body text on the voice surface, and the dark buttons (ink on the accent).
    expect(contrast("#2B2438", "#FBEFF3")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#FBF6F1", mix("#D88AA6", "#352D43", 0.06))).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#2B2438", "#D88AA6")).toBeGreaterThanOrEqual(4.5);
    // The dark accent as link text on every dark surface.
    for (const bg of ["#352D43", "#2B2438", "#382C43"]) expect(contrast("#D88AA6", bg), bg).toBeGreaterThanOrEqual(4.5);
  });
});

describe("errors aren't told by colour alone (decision 150)", () => {
  it("every role=alert gets a decorative error icon before its words (a text-free pseudo-element)", () => {
    const css = readFileSync(join("src", "app", "globals.css"), "utf8");
    const rule = css.slice(css.indexOf('[role="alert"]::before'), css.indexOf("}", css.indexOf('[role="alert"]::before')));
    expect(rule).toContain('content: "";');
    expect(rule).toContain("background-color: currentColor;");
    expect(rule).toMatch(/mask: url\("data:image\/svg\+xml,/);
    // Older Safari needs the prefixed mask (else a solid square).
    expect(rule).toMatch(/-webkit-mask: url\("data:image\/svg\+xml,/);
    // A heading alert carries the icon inside the heading, in its own rule
    // (a browser without :has() keeps the base rule).
    expect(css).toContain('[role="alert"] > h1::before');
    expect(css).toMatch(/\[role="alert"\]:has\(> h1\)::before \{\s*display: none;/);
  });
});
