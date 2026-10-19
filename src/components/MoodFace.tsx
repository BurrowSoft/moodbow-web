import faces from "../../content/contracts/mood-faces.json";
import { MOOD_COLOURS, MOOD_DOT_OUTLINE } from "@/lib/journal/checkIn";

// A mood face (the approved screen review; the app draws the same): the
// mood's Sunrise circle with the 1 px muted outline, and the contract's
// glyph (mood-faces.json: two ink eyes and the mood's mouth) centred on it
// at glyph_scale of the circle's diameter. Decoration: the mood is always
// named in words beside it. className sets the size; a selected face adds
// the accent ring.
export function MoodFace({ mood, className, selected = false }: { mood: number; className: string; selected?: boolean }) {
  // The diameter includes the 1 px outline on each side.
  const glyph = `calc((100% + 2px) * ${faces.glyph_scale})`;
  return (
    <span
      aria-hidden="true"
      data-testid="mood-face"
      className={`relative inline-block shrink-0 rounded-full ${MOOD_COLOURS[mood - 1]} ${MOOD_DOT_OUTLINE} ${className} ${selected ? "ring-2 ring-accent ring-offset-2" : ""}`}
    >
      <svg
        viewBox={`0 0 ${faces.view_box} ${faces.view_box}`}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: glyph, height: glyph }}
        fill="none"
      >
        {faces.eyes.map((eye) => (
          <circle key={eye.cx} cx={eye.cx} cy={eye.cy} r={eye.r} fill={faces.ink} />
        ))}
        <path d={faces.mouths[String(mood) as keyof typeof faces.mouths]} stroke={faces.ink} strokeWidth={faces.mouth_stroke_width} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
