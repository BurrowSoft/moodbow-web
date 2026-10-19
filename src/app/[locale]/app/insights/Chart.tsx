import { valueHex, type ValueKey } from "@/lib/journal/valueColours";

// One Insights chart, drawn as SVG on the server (no chart library, no JS):
// a line for 1–5 scales (mood, stress) or bars for amounts (sleep hours,
// exercise minutes), one slot per day of the range. A day with no value is
// a gap: no bar, and the line skips it. Exercise 0 ("None") is a value and
// gets a flat bar.
// Colours (decision 150): each bar and point takes its stored value's
// Sunrise colour (colourKey, colour-map.json), with the muted outline;
// movement 0 stays neutral. The line is a vertical gradient along the value
// axis (each whole value at its own colour). Axes stay neutral.
type Props = { kind: "line" | "bars"; points: (number | null)[]; min: number; max: number; labelledBy: string; colourKey: ValueKey; gradientId: string };

const W = 300;
const H = 120;
const PAD = 8;
// Points: a zero-length round-capped stroke in screen pixels, so it stays
// a circle although the chart stretches (preserveAspectRatio="none").
const DOT = 7;

export function Chart({ kind, points, min, max, labelledBy, colourKey, gradientId }: Props) {
  const slot = (W - PAD * 2) / points.length;
  const x = (i: number) => PAD + slot * i + slot / 2;
  const y = (v: number) => H - PAD - ((Math.min(Math.max(v, min), max) - min) / (max - min || 1)) * (H - PAD * 2);
  const present = points.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  const wholeValues = Array.from({ length: max - min + 1 }, (_, k) => min + k);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={labelledBy} className="h-32 w-full text-muted" preserveAspectRatio="none">
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} className="stroke-border" strokeWidth={1} />
      {kind === "bars" ? (
        present.map(({ v, i }) => {
          const top = y(v);
          const width = Math.max(slot * 0.6, 1.5);
          const hex = valueHex(colourKey, v);
          return (
            <rect
              key={i}
              data-value-colour={hex ?? "neutral"}
              x={x(i) - width / 2}
              y={Math.min(top, H - PAD - 1.5)}
              width={width}
              height={Math.max(H - PAD - top, 1.5)}
              rx={1}
              fill={hex ?? "currentColor"}
              stroke="currentColor"
              strokeWidth={hex ? 1 : 0}
              vectorEffect="non-scaling-stroke"
            />
          );
        })
      ) : (
        <>
          <defs>
            <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={y(min)} y2={y(max)}>
              {wholeValues.map((v) => (
                <stop key={v} offset={(v - min) / (max - min || 1)} stopColor={valueHex(colourKey, v) ?? "currentColor"} />
              ))}
            </linearGradient>
          </defs>
          <polyline
            points={present.map(({ v, i }) => `${x(i)},${y(v)}`).join(" ")}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {present.map(({ v, i }) => {
            const hex = valueHex(colourKey, v);
            return (
              <g key={i} data-value-colour={hex ?? "neutral"}>
                <line x1={x(i)} x2={x(i)} y1={y(v)} y2={y(v)} stroke="currentColor" strokeWidth={DOT + 2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <line x1={x(i)} x2={x(i)} y1={y(v)} y2={y(v)} stroke={hex ?? "currentColor"} strokeWidth={DOT} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </>
      )}
    </svg>
  );
}
