import { MOOD_DOT_OUTLINE } from "@/lib/journal/valueColours";

// A check-in value's Sunrise colour as a small outlined dot (decision 150),
// decoration only: the value is always said in words next to it. Nothing
// for a neutral value (movement 0).
export function ValueDot({ hex, testId }: { hex: string | null; testId?: string }) {
  if (!hex) return null;
  return <span aria-hidden="true" data-testid={testId} data-value-colour={hex} className={`inline-block h-3 w-3 shrink-0 rounded-full ${MOOD_DOT_OUTLINE}`} style={{ backgroundColor: hex }} />;
}
