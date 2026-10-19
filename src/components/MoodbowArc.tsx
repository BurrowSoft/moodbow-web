import { STEP_HEX } from "@/lib/journal/valueColours";

// The home page's moodbow (decision: the brand motif, as on the store frames
// and the share card): a month of Sunrise bands drawn as half-rings, the
// first day innermost. Decorative (aria-hidden): the heading says what it
// is. The bands draw in one after another over ~1.2 s; with reduced motion
// the arc is simply there.
// A sample month: mostly calm and good days with a few low ones, as a real
// month looks; never all gold.
const SAMPLE = [3, 4, 4, 5, 3, 4, 2, 4, 5, 4, 3, 4, 5, 5, 4, 3, 1, 4, 4, 5, 4, 3, 4, 5];

const W = 300;
const CX = 150;
const CY = 150;
const R_IN = 34;
const R_OUT = 144;
const GAP = 1.5;

export function MoodbowArc({ moods = SAMPLE, className }: { moods?: number[]; className?: string }) {
  const n = moods.length;
  const thickness = (R_OUT - R_IN - GAP * (n - 1)) / n;
  // Spread over ~1.2 s in total: each band starts a little after the last.
  const step = 900 / n;
  return (
    <svg viewBox={`0 0 ${W} ${CY + 2}`} className={className} aria-hidden="true" data-testid="moodbow-arc">
      {moods.map((mood, i) => {
        const r = R_IN + thickness / 2 + i * (thickness + GAP);
        return (
          <path
            key={i}
            d={`M ${CX - r} ${CY} A ${r} ${r} 0 0 1 ${CX + r} ${CY}`}
            fill="none"
            stroke={STEP_HEX[mood - 1]}
            strokeWidth={thickness}
            pathLength={1}
            strokeDasharray="1"
            className="arc-band"
            style={{ animationDelay: `${Math.round(i * step)}ms` }}
          />
        );
      })}
    </svg>
  );
}
