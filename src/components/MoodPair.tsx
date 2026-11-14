import { MOOD_DOT_OUTLINE, STEP_HEX } from "@/lib/journal/valueColours";

// A comparison on the 1–5 mood scale, laid out as storybook board 3 (UX, 14 Nov): a header row with
// the pair's title at left (a tag, quoted) and the warm difference chip at right; then two labelled
// rows ("With {tag}" / "Other days"), each bar in a track at v/5 of its length, its value at the
// row's end. BOTH bars take the colour of their own value, rounded to the nearest mood step
// (colour-map.json, decision 150), with the decision-149 outline so the pale steps read. The pair is
// ONE image named by the full sentence (with "of 5"), so the meaning never depends on colour and
// nothing visible is read twice.
const step = (v: number) => STEP_HEX[Math.min(5, Math.max(1, Math.round(v))) - 1];

type Props = {
  sentence: string;
  title: string;
  labels: [string, string];
  a: number;
  b: number;
  format: (v: number) => string;
  signed: (v: number) => string;
  testId?: string;
};

export function MoodPair({ sentence, title, labels, a, b, format, signed, testId }: Props) {
  // The chip from the two values as shown (tenths), so the three numbers always agree (the Reviewer).
  const tenths = (v: number) => Math.round(v * 10) / 10;
  const diff = tenths(tenths(a) - tenths(b));
  return (
    <div role="img" aria-label={sentence} data-testid={testId} className="mt-2 space-y-[6px]">
      <span className="flex flex-wrap items-center justify-between gap-x-[12px] gap-y-[4px]">
        <span className="min-w-0 font-medium text-text [overflow-wrap:anywhere]">{title}</span>
        <span data-testid={testId ? `${testId}-diff` : undefined} className="shrink-0 rounded-full bg-pair-chip px-[8px] py-[2px] text-xs font-medium text-pair-chip-ink">
          {signed(diff)}
        </span>
      </span>
      <span className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)_max-content] items-center gap-x-[8px] gap-y-[4px]">
        {[a, b].map((v, i) => (
          <span key={i} className="contents">
            <span className="min-w-0 text-xs text-muted [overflow-wrap:anywhere]">{labels[i]}</span>
            <span data-testid={testId ? `${testId}-track` : undefined} className="block h-[12px] min-w-[48px] rounded-full bg-pair-track">
              <span
                data-testid={testId ? `${testId}-bar` : undefined}
                className={`block h-full rounded-full ${MOOD_DOT_OUTLINE}`}
                style={{ width: `${Math.min(100, Math.max(4, (v / 5) * 100))}%`, backgroundColor: step(v) }}
              />
            </span>
            <span className="text-end text-xs text-text">{format(v)}</span>
          </span>
        ))}
      </span>
    </div>
  );
}
