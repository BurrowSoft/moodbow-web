import { valueHex } from "@/lib/journal/valueColours";
import { MOOD_HEX, type CardFormat, type MonthCheckIn } from "./moodbow";

// The 1.1 cards (decision 169, specs/m10-share-card.md "1.1"): the chart card
// (the Insights mood line for a range) and the milestone card. The app draws
// the same cards from the same numbers; the shared fixture pins them.

// ---- Milestone ---------------------------------------------------------

// Total days journaled (not in a row; no streaks). The card shows the
// highest one reached.
export const MILESTONES = [30, 100, 365] as const;
export type Milestone = (typeof MILESTONES)[number];

export function milestoneFor(daysJournaled: number): Milestone | null {
  return [...MILESTONES].reverse().find((m) => daysJournaled >= m) ?? null;
}

// The milestone card's arc: the latest check-ins, at most 31, earliest
// innermost (as on the moodbow card).
export const MILESTONE_BANDS = 31;
export function latestBands(rows: MonthCheckIn[], max: number = MILESTONE_BANDS): string[] {
  return rows
    .filter((r) => r.mood >= 1 && r.mood <= 5)
    .sort((a, b) => a.local_date.localeCompare(b.local_date))
    .slice(-max)
    .map((r) => MOOD_HEX[r.mood - 1]);
}

// The milestone title is larger than the month title (72 / 56 px).
export const MILESTONE_TITLE_SIZE: Record<CardFormat, number> = { story: 96, square: 72 };

// ---- Chart -------------------------------------------------------------

// The visual's box (the arc's area): x 140–940, story y 700–1100, square
// y 260–720.
export const CHART_BOX: Record<CardFormat, { x: number; y: number; w: number; h: number }> = {
  story: { x: 140, y: 700, w: 800, h: 400 },
  square: { x: 140, y: 260, w: 800, h: 460 },
};
// Line width and dot radius (the dot sits in a muted ring 2 px wider).
export const CHART_STROKE: Record<CardFormat, { line: number; dot: number }> = {
  story: { line: 6, dot: 10 },
  square: { line: 5, dot: 8 },
};

type Point = { x: number; y: number };
export type LineGeometry = {
  // Runs of consecutive days with a check-in; a day without one is a gap.
  segments: Point[][];
  dots: (Point & { hex: string })[];
  // A vertical gradient by value: mood 1 (blue) at the bottom, 5 (gold) at the top.
  gradient: { y1: number; y2: number; stops: { offset: number; hex: string }[] };
  baseline: { x1: number; x2: number; y: number };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

// One slot per day of the range, the point at the slot's centre (as the
// Insights chart); mood 1 at the box's bottom, 5 at its top. No numbers,
// dates or axis labels are drawn: only these shapes.
export function chartGeometry(moods: (number | null)[], format: CardFormat): LineGeometry {
  const { x, y, w, h } = CHART_BOX[format];
  const slot = w / Math.max(moods.length, 1);
  const px = (i: number) => r2(x + slot * (i + 0.5));
  const py = (v: number) => r2(y + h - ((v - 1) / 4) * h);
  const segments: Point[][] = [];
  let run: Point[] = [];
  const dots: LineGeometry["dots"] = [];
  moods.forEach((v, i) => {
    if (v === null || v < 1 || v > 5) {
      if (run.length) segments.push(run);
      run = [];
      return;
    }
    const p = { x: px(i), y: py(v) };
    run.push(p);
    dots.push({ ...p, hex: valueHex("mood", v)! });
  });
  if (run.length) segments.push(run);
  return {
    segments,
    dots,
    gradient: { y1: y + h, y2: y, stops: [1, 2, 3, 4, 5].map((v) => ({ offset: (v - 1) / 4, hex: valueHex("mood", v)! })) },
    baseline: { x1: x, x2: x + w, y: y + h },
  };
}
