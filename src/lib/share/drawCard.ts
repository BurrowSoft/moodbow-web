import { preview } from "@/lib/journal/entry";
import { CHART_STROKE, chartGeometry } from "./cards";
import { bands, LAYOUT, LOGO_RATIO, THEMES, type CardFormat, type CardTheme } from "./moodbow";

// Draws the card on a 2D canvas context, in the browser; nothing is
// uploaded (decision 20). Every string comes in already translated
// (decision 34); this file only places it.
export type CardContent = {
  format: CardFormat;
  theme: CardTheme;
  colours: string[];
  monthLabel: string;
  daysLabel: string;
  line: string;
  fontFamily: string;
  logo: CanvasImageSource | null;
  // The 1.1 cards (decision 169): the chart card draws the mood line from
  // these values (null = a day without a check-in) instead of the arc; the
  // milestone card's title is larger; an empty daysLabel draws no subtitle.
  lineChart?: (number | null)[];
  titleSize?: number;
};

type Measure = (text: string) => number;

// The optional line: at most `maxLines` lines of at most `maxWidth` px,
// broken between words; what doesn't fit ends in "…".
export function wrapLine(text: string, measure: Measure, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && measure(`${last} ${word}`) <= maxWidth) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const fit = (s: string, ellipsis: boolean) => {
    let out = s;
    const tail = () => (ellipsis || out !== s ? "…" : "");
    while (out.length > 1 && measure(`${out}${tail()}`) > maxWidth) out = out.slice(0, -1).trimEnd();
    return `${out}${tail()}`;
  };
  const kept = lines.slice(0, maxLines);
  const cut = lines.length > maxLines;
  return kept.map((l, i) => fit(l, cut && i === kept.length - 1));
}

export function drawCard(ctx: CanvasRenderingContext2D, c: CardContent): void {
  const L = LAYOUT[c.format];
  const T = THEMES[c.theme];
  ctx.save();
  ctx.fillStyle = T.background;
  ctx.fillRect(0, 0, L.width, L.height);

  const font = (weight: 400 | 500, size: number) => `${weight} ${size}px ${c.fontFamily}`;
  const centreText = (text: string, top: number, weight: 400 | 500, size: number, colour: string) => {
    ctx.font = font(weight, size);
    ctx.fillStyle = colour;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, L.width / 2, top);
  };

  centreText(c.monthLabel, L.month.top, 500, c.titleSize ?? L.month.size, T.text);

  if (c.lineChart) drawLine(ctx, c.lineChart, c.format, T.muted);
  else {
    // The moodbow: half-circles over the top, butt ends on the baseline.
    const { thickness, radii } = bands(c.colours.length, c.format);
    ctx.lineCap = "butt";
    ctx.lineWidth = thickness;
    radii.forEach((r, i) => {
      ctx.strokeStyle = c.colours[i];
      ctx.beginPath();
      ctx.arc(L.centre.x, L.centre.y, r, Math.PI, 2 * Math.PI);
      ctx.stroke();
    });
  }

  if (c.daysLabel) centreText(c.daysLabel, L.days.top, 400, L.days.size, T.muted);

  if (c.line.trim()) {
    ctx.font = font(400, L.line.size);
    const lines = wrapLine(preview(c.line, L.line.maxChars),(s) => ctx.measureText(s).width, L.line.maxWidth, L.line.maxLines);
    lines.forEach((text, i) => centreText(text, L.line.top + i * Math.round(L.line.size * 1.3), 400, L.line.size, T.text));
  }

  // Footer: the logo, then moodbow.com below it (story) or beside it (square).
  const F = L.footer;
  const logoW = F.logoHeight * LOGO_RATIO;
  const logoTop = F.logoBottom - F.logoHeight;
  ctx.font = font(400, F.urlSize);
  ctx.fillStyle = T.muted;
  if (F.urlBeside) {
    const urlW = ctx.measureText("moodbow.com").width;
    const left = (L.width - (logoW + F.urlGap + urlW)) / 2;
    if (c.logo) ctx.drawImage(c.logo, left, logoTop, logoW, F.logoHeight);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("moodbow.com", left + logoW + F.urlGap, logoTop + F.logoHeight / 2);
  } else {
    if (c.logo) ctx.drawImage(c.logo, (L.width - logoW) / 2, logoTop, logoW, F.logoHeight);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("moodbow.com", L.width / 2, F.logoBottom + F.urlGap);
  }
  ctx.restore();
}

// The chart card's mood line (lib/share/cards.ts geometry): a neutral
// baseline, the runs of consecutive days stroked with the vertical Sunrise
// gradient, and a dot per stored value in its colour inside a muted ring.
function drawLine(ctx: CanvasRenderingContext2D, moods: (number | null)[], format: CardFormat, muted: string): void {
  const g = chartGeometry(moods, format);
  const { line, dot } = CHART_STROKE[format];
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = muted;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(g.baseline.x1, g.baseline.y);
  ctx.lineTo(g.baseline.x2, g.baseline.y);
  ctx.stroke();
  ctx.restore();
  const gradient = ctx.createLinearGradient(0, g.gradient.y1, 0, g.gradient.y2);
  for (const s of g.gradient.stops) gradient.addColorStop(s.offset, s.hex);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = line;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const run of g.segments) {
    if (run.length < 2) continue;
    ctx.beginPath();
    run.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }
  for (const p of g.dots) {
    ctx.fillStyle = muted;
    ctx.beginPath();
    ctx.arc(p.x, p.y, dot + 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = p.hex;
    ctx.beginPath();
    ctx.arc(p.x, p.y, dot, 0, 2 * Math.PI);
    ctx.fill();
  }
}
