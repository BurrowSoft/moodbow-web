// "My month's moodbow" (M10), the layout from specs/m10-share-card.md
// (decision 104). App and web draw the same card: this geometry, tested
// against the spec's numbers, is the cross-platform contract.

export type CardFormat = "story" | "square";
export type CardTheme = "light" | "dark";

export const MIN_CHECK_INS = 5;

// Mood 1 → 5, the same colours as the check-in picker, in both themes.
export const MOOD_HEX = ["#9B84D6", "#B9A3E3", "#E3C0D0", "#F2A07B", "#E27D9A"] as const;

export const THEMES: Record<CardTheme, { background: string; text: string; muted: string; logo: string }> = {
  light: { background: "#FBF6F1", text: "#2B2438", muted: "#6B6278", logo: "/brand/moodbow-logo-horizontal-light.svg" },
  dark: { background: "#2B2438", text: "#FBF6F1", muted: "#C9C1D4", logo: "/brand/moodbow-logo-horizontal-dark.svg" },
};

// The logo SVG's aspect ratio (686 × 140).
export const LOGO_RATIO = 686 / 140;

export const LAYOUT = {
  story: {
    width: 1080,
    height: 1920,
    centre: { x: 540, y: 1100 },
    rIn: 120,
    rOut: 420,
    month: { size: 72, top: 200 },
    days: { size: 44, top: 1180 },
    line: { size: 40, top: 1300, maxWidth: 880, maxLines: 2, maxChars: 80 },
    footer: { logoHeight: 64, logoBottom: 1760, urlSize: 32, urlGap: 24, urlBeside: false },
  },
  square: {
    width: 1080,
    height: 1080,
    centre: { x: 540, y: 720 },
    rIn: 100,
    rOut: 340,
    month: { size: 56, top: 110 },
    days: { size: 36, top: 800 },
    line: { size: 32, top: 870, maxWidth: 880, maxLines: 1, maxChars: 60 },
    footer: { logoHeight: 48, logoBottom: 1000, urlSize: 26, urlGap: 16, urlBeside: true },
  },
} as const;

// Concentric half-circles (180° → 360°: left, over the top, right), one per
// check-in, the earliest innermost. g = 4 px up to 15 bands, else 2 px;
// t = (R_out − R_in − g·(n − 1)) / n; band i at r_i = R_in + t/2 + i·(t + g).
export function bands(n: number, format: CardFormat): { gap: number; thickness: number; radii: number[] } {
  const { rIn, rOut } = LAYOUT[format];
  const gap = n <= 15 ? 4 : 2;
  const thickness = (rOut - rIn - gap * (n - 1)) / n;
  const radii = Array.from({ length: n }, (_, i) => rIn + thickness / 2 + i * (thickness + gap));
  return { gap, thickness, radii };
}

export type MonthCheckIn = { local_date: string; mood: number };

// The month's check-ins in order (the earliest first), as colours. Days
// without a check-in are simply not there (no gaps, no guilt).
export function monthBands(rows: MonthCheckIn[], month: string): string[] {
  return rows
    .filter((r) => r.local_date.startsWith(`${month}-`) && r.mood >= 1 && r.mood <= 5)
    .sort((a, b) => a.local_date.localeCompare(b.local_date))
    .map((r) => MOOD_HEX[r.mood - 1]);
}

// The PNG's name: moodbow-YYYY-MM.png, nothing else.
export const cardFileName = (month: string) => `moodbow-${month}.png`;

// The month's first and last day ("2026-10" → 2026-10-01 … 2026-10-31).
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

// "October 2026" in the user's regional format (decision 89).
export const formatMonth = (month: string, dateLocaleTag: string) =>
  new Intl.DateTimeFormat(dateLocaleTag, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
