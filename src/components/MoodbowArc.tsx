import { arcBands, SAMPLE_MONTH } from "@/lib/moodbowArc";

// The home page's moodbow (lib/moodbowArc.ts: the brand motif). Decorative
// (aria-hidden): the heading says what it is. The bands draw in one after
// another over ~1.2 s; with reduced motion the arc is simply there.
const GEOMETRY = { cx: 150, cy: 150, rIn: 34, rOut: 144, gap: 1.5 };

export function MoodbowArc({ moods = SAMPLE_MONTH, className }: { moods?: number[]; className?: string }) {
  const bands = arcBands(moods, GEOMETRY);
  // Spread over ~1.2 s in total: each band starts a little after the last.
  const step = 900 / bands.length;
  return (
    <svg viewBox={`0 0 300 ${GEOMETRY.cy + 2}`} className={className} aria-hidden="true" data-testid="moodbow-arc">
      {bands.map(({ d, hex, width }, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={hex}
          strokeWidth={width}
          pathLength={1}
          strokeDasharray="1"
          className="arc-band"
          style={{ animationDelay: `${Math.round(i * step)}ms` }}
        />
      ))}
    </svg>
  );
}
