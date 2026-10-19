// One Insights chart, drawn as SVG on the server (no chart library, no JS):
// a line for 1–5 scales (mood, stress) or bars for amounts (sleep hours,
// exercise minutes), one slot per day of the range. A day with no value is
// a gap: no bar, and the line skips it. Exercise 0 ("None") is a value and
// gets a flat bar.
// neutral: the mood chart's line is ink / cream, never the accent or a mood
// colour (decision 150: colour means mood; only mood points may carry it).
type Props = { kind: "line" | "bars"; points: (number | null)[]; min: number; max: number; labelledBy: string; neutral?: boolean };

const W = 300;
const H = 120;
const PAD = 8;

export function Chart({ kind, points, min, max, labelledBy, neutral = false }: Props) {
  const slot = (W - PAD * 2) / points.length;
  const x = (i: number) => PAD + slot * i + slot / 2;
  const y = (v: number) => H - PAD - ((Math.min(Math.max(v, min), max) - min) / (max - min || 1)) * (H - PAD * 2);
  const present = points.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={labelledBy} className={`h-32 w-full ${neutral ? "text-text" : "text-accent"}`} preserveAspectRatio="none">
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} className="stroke-border" strokeWidth={1} />
      {kind === "bars"
        ? present.map(({ v, i }) => {
            const top = y(v);
            const width = Math.max(slot * 0.6, 1.5);
            return <rect key={i} x={x(i) - width / 2} y={Math.min(top, H - PAD - 1.5)} width={width} height={Math.max(H - PAD - top, 1.5)} rx={1} className="fill-current" />;
          })
        : (
            <polyline
              points={present.map(({ v, i }) => `${x(i)},${y(v)}`).join(" ")}
              fill="none"
              className="stroke-current"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
    </svg>
  );
}
