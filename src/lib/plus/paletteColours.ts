import type { Palette } from "./palettes";

// The extra themes' colours (UX, 11 Nov), from the brand's mood colours: each
// palette's light and dark tokens. globals.css holds the same values (its
// "Moodbow Plus palettes" block); palettes.test.ts checks the two match and
// that every text colour reaches 4.5:1 on every background it sits on.
export type Tokens = { bg: string; surface: string; border: string; text: string; muted: string; accent: string; onAccent: string; pill: string };

export const PALETTE_COLOURS: Record<Palette, { light: Tokens; dark: Tokens }> = {
  dusk: {
    light: { bg: "#f5f2fb", surface: "#ffffff", border: "#e4ddf3", text: "#2b2438", muted: "#5d5470", accent: "#6a4fb3", onAccent: "#ffffff", pill: "#ece6f8" },
    dark: { bg: "#221d33", surface: "#2f2846", border: "#40375c", text: "#f3effb", muted: "#c6bedb", accent: "#b9a6ec", onAccent: "#221d33", pill: "#352d50" },
  },
  sunrise: {
    light: { bg: "#fdf5ec", surface: "#ffffff", border: "#f1e2cf", text: "#2b2438", muted: "#635546", accent: "#9c4519", onAccent: "#ffffff", pill: "#fbe9d6" },
    dark: { bg: "#2a2019", surface: "#3a2c22", border: "#4d3b2d", text: "#fbf3ea", muted: "#d9c7b4", accent: "#e9b949", onAccent: "#2a2019", pill: "#44331f" },
  },
  sea: {
    light: { bg: "#f1f4f7", surface: "#ffffff", border: "#dde4eb", text: "#1f2a36", muted: "#4f5d6b", accent: "#3c5a7a", onAccent: "#ffffff", pill: "#e3eaf1" },
    dark: { bg: "#18212b", surface: "#222e3a", border: "#33414f", text: "#eef3f7", muted: "#b7c4d1", accent: "#9fb6d0", onAccent: "#18212b", pill: "#2a3846" },
  },
};

// The default theme's, for the help card, which keeps its own colours in every theme.
export const DEFAULT_COLOURS: { light: Tokens; dark: Tokens } = {
  light: { bg: "#fbf6f1", surface: "#ffffff", border: "#ece3da", text: "#2b2438", muted: "#6b6278", accent: "#a8456a", onAccent: "#fbf6f1", pill: "#f9eaec" },
  dark: { bg: "#2b2438", surface: "#352d43", border: "#463c56", text: "#fbf6f1", muted: "#c9c1d4", accent: "#d88aa6", onAccent: "#2b2438", pill: "#382c43" },
};

const vars = (t: Tokens, hover: "black" | "white") =>
  `--bg: ${t.bg}; --surface: ${t.surface}; --border: ${t.border}; --text: ${t.text}; --muted: ${t.muted}; --accent: ${t.accent}; --on-accent: ${t.onAccent}; --pill: ${t.pill}; --accent-hover: color-mix(in srgb, var(--accent) 85%, ${hover});`;

// The CSS for globals.css: on screen only (paper stays black on white). A
// palette's dark variant follows the same rules as the default's: the
// system's dark unless Light was chosen, or Dark chosen.
export function paletteCss(): string {
  const out: string[] = ["@media screen {"];
  for (const [name, c] of Object.entries(PALETTE_COLOURS)) {
    out.push(`  :root[data-palette="${name}"] { ${vars(c.light, "black")} }`);
    out.push(`  :root[data-palette="${name}"][data-theme="dark"] { ${vars(c.dark, "white")} }`);
  }
  out.push(`  [data-palette] [data-default-colours] { ${vars(DEFAULT_COLOURS.light, "black")} }`);
  out.push(`  [data-palette][data-theme="dark"] [data-default-colours] { ${vars(DEFAULT_COLOURS.dark, "white")} }`);
  out.push("}");
  out.push("@media screen and (prefers-color-scheme: dark) {");
  for (const [name, c] of Object.entries(PALETTE_COLOURS)) out.push(`  :root[data-palette="${name}"]:not([data-theme="light"]) { ${vars(c.dark, "white")} }`);
  out.push(`  [data-palette]:not([data-theme="light"]) [data-default-colours] { ${vars(DEFAULT_COLOURS.dark, "white")} }`);
  out.push("}");
  return out.join("\n");
}
