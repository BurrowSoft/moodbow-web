import { ImageResponse } from "next/og";
import { arcBands, SAMPLE_MONTH } from "@/lib/moodbowArc";
import messages from "@/messages/en.json";

// The launch Open Graph image (1200 × 630, UX): the Sunrise moodbow on cream
// with "Moodbow" and "Your month, as a rainbow", drawn with Next's built-in
// ImageResponse (no new dependency) from the home page's band geometry. The
// site points to it only once the web journal is live (lib/metadata.ts);
// until then the current /og-image.png stays. Built once, at build time.
export const dynamic = "force-static";

const W = 1200;
const H = 630;
// The arc on the right half, the words on the left: text never overlaps it
// (the store art's rule).
const GEOMETRY = { cx: 860, cy: 470, rIn: 70, rOut: 290, gap: 3 };
const CREAM = "#FBF6F1";
const INK = "#2B2438";
const MUTED = "#6B6278";

export function GET() {
  const bands = arcBands(SAMPLE_MONTH, GEOMETRY);
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", background: CREAM, position: "relative" }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
          {bands.map(({ d, hex, width }, i) => (
            <path key={i} d={d} fill="none" stroke={hex} strokeWidth={width} />
          ))}
        </svg>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 90, width: 560, height: H }}>
          <div style={{ fontSize: 44, color: MUTED, letterSpacing: 1 }}>{messages.meta.siteName}</div>
          <div style={{ fontSize: 72, color: INK, lineHeight: 1.1, marginTop: 18 }}>{messages.home.heroTitle}</div>
        </div>
      </div>
    ),
    { width: W, height: H },
  );
}
