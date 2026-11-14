import toolbox from "../../../content/toolbox.json";

// Things that help me (1.2; content/toolbox.json, the rules both clients run).
export const TOOLBOX_RULES = toolbox.rules;
export const BREATHING = toolbox.breathing;

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

// Where breathing is, `second` seconds in (0 ≤ second < totalSeconds): the phase and
// the whole seconds left in it, for the words shown with reduced motion.
export function breathingAt(second: number): { phase: "in" | "out"; left: number } {
  const cycle = BREATHING.inSeconds + BREATHING.outSeconds;
  const into = second % cycle;
  return into < BREATHING.inSeconds ? { phase: "in", left: BREATHING.inSeconds - into } : { phase: "out", left: cycle - into };
}

export const parseToolboxItems = (rows: unknown): ToolboxItem[] =>
  (Array.isArray(rows) ? rows : [])
    .filter((r): r is ToolboxItem => typeof r?.id === "string" && typeof r?.text === "string" && Number.isInteger(r?.position))
    .map(({ id, text, position }) => ({ id, text, position }))
    .sort((a, b) => a.position - b.position);
