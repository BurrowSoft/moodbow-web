import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { arcBands, SAMPLE_MONTH } from "@/lib/moodbowArc";
import messages from "@/messages/en.json";

// The launch Open Graph image (1200 × 630, UX): the Sunrise moodbow on cream
// with the horizontal logo and "Your month, as a rainbow" in Poppins (the
// brand face; assets/fonts, OFL, the same file the app ships), drawn with
// Next's built-in ImageResponse (no new dependency) from the home page's
// band geometry. The site points to it only once the web journal is live
// (lib/metadata.ts); until then the current /og-image.png stays. Built once,
// at build time.
export const dynamic = "force-static";

const W = 1200;
const H = 630;
// The arc on the right half, the words on the left: text never overlaps it
// (the store art's rule).
const GEOMETRY = { cx: 860, cy: 470, rIn: 70, rOut: 290, gap: 3 };
const CREAM = "#FBF6F1";
const INK = "#2B2438";
// The light horizontal logo (mark + wordmark, all paths), 686 × 140, shown
// 56 px tall.
const LOGO_H = 56;
const LOGO_W = Math.round((686 / 140) * LOGO_H);

export function GET() {
  const poppins = readFileSync(join(process.cwd(), "assets", "fonts", "Poppins-Medium.ttf"));
  const logo = `data:image/svg+xml;base64,${readFileSync(join(process.cwd(), "public", "brand", "moodbow-logo-horizontal-light.svg")).toString("base64")}`;
  const bands = arcBands(SAMPLE_MONTH, GEOMETRY);
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", background: CREAM, position: "relative", fontFamily: "Poppins" }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
          {bands.map(({ d, hex, width }, i) => (
            <path key={i} d={d} fill="none" stroke={hex} strokeWidth={width} />
          ))}
        </svg>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 90, width: 560, height: H }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain img only */}
          <img src={logo} width={LOGO_W} height={LOGO_H} alt={messages.meta.siteName} />
          <div style={{ fontSize: 68, color: INK, lineHeight: 1.12, marginTop: 28, letterSpacing: -1 }}>{messages.home.heroTitle}</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: [{ name: "Poppins", data: poppins, weight: 500, style: "normal" }] },
  );
}
