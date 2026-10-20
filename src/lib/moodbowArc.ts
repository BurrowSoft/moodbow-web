import { STEP_HEX } from "@/lib/journal/valueColours";

// The moodbow's geometry, shared by the home page's arc and the launch Open
// Graph image (the brand motif, as on the store frames and the share card):
// a month of Sunrise bands as half-rings around one centre, the first day
// innermost, with thin gaps between them.

// A sample month: mostly calm and good days with a few low ones, as a real
// month looks; never all gold.
export const SAMPLE_MONTH = [3, 4, 4, 5, 3, 4, 2, 4, 5, 4, 3, 4, 5, 5, 4, 3, 1, 4, 4, 5, 4, 3, 4, 5];

export type ArcGeometry = { cx: number; cy: number; rIn: number; rOut: number; gap: number };
export type ArcBand = { d: string; hex: string; width: number };

export function arcBands(moods: number[], { cx, cy, rIn, rOut, gap }: ArcGeometry): ArcBand[] {
  const n = moods.length;
  const width = (rOut - rIn - gap * (n - 1)) / n;
  return moods.map((mood, i) => {
    const r = rIn + width / 2 + i * (width + gap);
    return { d: `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`, hex: STEP_HEX[mood - 1], width };
  });
}
