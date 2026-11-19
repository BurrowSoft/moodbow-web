import toolbox from "../../../content/contracts/toolbox.json";

// Things that help me (1.2; content/contracts/toolbox.json, the rules both clients run, from the
// app repo since v2).
export const TOOLBOX_RULES = toolbox.rules;

// Breathing (v2, specs/plus-breathing-draft.md): patterns of steps, each "in", "out" or "hold"
// for whole seconds, run for whole cycles. The first is free (today's: in 4, out 6, six times);
// the rest are Plus. No hold longer than 4 s, and each about a minute (the contract test).
export type BreathStep = "in" | "out" | "hold";
export type BreathingPattern = { id: string; plus: boolean; steps: [BreathStep, number][]; cycles: number };
export const PATTERNS: BreathingPattern[] = toolbox.patterns as BreathingPattern[];
export const FREE_PATTERN: BreathingPattern = PATTERNS[0];
export const cycleSeconds = (p: BreathingPattern) => p.steps.reduce((sum, [, s]) => sum + s, 0);
export const patternSeconds = (p: BreathingPattern) => cycleSeconds(p) * p.cycles;
export const patternById = (id: string | null | undefined): BreathingPattern | null => PATTERNS.find((p) => p.id === id) ?? null;

export type ToolboxItem = { id: string; text: string; position: number };

// As the server counts it (char_length): code points, so an emoji is one.
export const toolboxLength = (text: string) => [...text].length;

export type ToolboxProblem = "empty" | "tooLong" | "full";
export function toolboxProblem(text: string, count: number, adding: boolean): ToolboxProblem | null {
  if (text.trim() === "") return "empty";
  if (toolboxLength(text) > TOOLBOX_RULES.maxChars) return "tooLong";
  if (adding && count >= TOOLBOX_RULES.maxItems) return "full";
  return null;
}

// Today's card: the latest check-in saved today has a low mood. null: none today.
export const toolboxCardShows = (todayMood: number | null) => todayMood !== null && (TOOLBOX_RULES.lowMoods as readonly number[]).includes(todayMood);

// Where breathing is, `second` seconds in (0 ≤ second < the pattern's length): the step, the
// whole seconds left in it (the words shown with reduced motion), and the breath before a hold
// ("in": the circle stays full; "out": it stays small).
export function breathingAt(second: number, pattern: BreathingPattern = FREE_PATTERN): { phase: BreathStep; left: number; held: "in" | "out" | null; of: number } {
  let into = second % cycleSeconds(pattern);
  // A hold at the very start follows the previous cycle's last breath.
  let last = ([...pattern.steps].reverse().find(([s]) => s !== "hold")?.[0] ?? "out") as "in" | "out";
  for (const [step, seconds] of pattern.steps) {
    if (into < seconds) return { phase: step, left: seconds - into, held: step === "hold" ? last : null, of: seconds };
    into -= seconds;
    if (step !== "hold") last = step;
  }
  return { phase: "out", left: 1, held: null, of: 1 };
}

export const parseToolboxItems = (rows: unknown): ToolboxItem[] =>
  (Array.isArray(rows) ? rows : [])
    .filter((r): r is ToolboxItem => typeof r?.id === "string" && typeof r?.text === "string" && Number.isInteger(r?.position))
    .map(({ id, text, position }) => ({ id, text, position }))
    .sort((a, b) => a.position - b.position);
