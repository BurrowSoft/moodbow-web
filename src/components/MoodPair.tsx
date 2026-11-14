import { MOOD_DOT_OUTLINE, STEP_HEX } from "@/lib/journal/valueColours";

// A comparison as two horizontal bars on the 1–5 mood scale (Vitor, 14 Nov: "the numbers look
// vague"; spec "What lifts me and Patterns, shown as colour bars"): BOTH bars take the colour of
// their own value, rounded to the nearest mood step (colour-map.json, decision 150), each with the
// decision-149 outline so the pale steps read. The values sit at the bars' ends in text ink, and a
// chip shows the difference. The pair is ONE image named by the full sentence, so the meaning never
// depends on colour; the sentence shown beside it is hidden from screen readers to say it once.
const step = (v: number) => STEP_HEX[Math.min(5, Math.max(1, Math.round(v))) - 1];

export function MoodPair({ sentence, a, b, format, signed, testId }: { sentence: string; a: number; b: number; format: (v: number) => string; signed: (v: number) => string; testId?: string }) {
  // The chip from the two values as shown (tenths), so the three numbers always agree (the Reviewer).
  const tenths = (v: number) => Math.round(v * 10) / 10;
  const diff = tenths(tenths(a) - tenths(b));
  return (
    <div role="img" aria-label={sentence} data-testid={testId} className="mt-2 flex items-center gap-[12px]">
      <span className="min-w-0 flex-1 space-y-[4px]">
        {[a, b].map((v, i) => (
          <span key={i} className="flex items-center gap-[8px]">
            <span className={`h-[12px] shrink-0 rounded-full ${MOOD_DOT_OUTLINE}`} style={{ width: `${Math.max(4, (v / 5) * 80)}%`, backgroundColor: step(v) }} />
            <span className="text-xs text-text">{format(v)}</span>
          </span>
        ))}
      </span>
      <span data-testid={testId ? `${testId}-diff` : undefined} className="shrink-0 rounded-full border border-border px-[8px] py-[2px] text-xs font-medium text-text">
        {signed(diff)}
      </span>
    </div>
  );
}
