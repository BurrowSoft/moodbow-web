import toolbox from "../../../content/toolbox.json";

// Grounding (1.3; content/toolbox.json, grounding): 5-4-3-2-1, Body scan and Name it, next to
// breathing in Me → Things that help me. Nothing here is saved or sent anywhere.
export const GROUNDING = toolbox.grounding;

// The three, by their address under /app/me/toolbox/.
export const GROUNDING_EXERCISES = ["5-4-3-2-1", "body-scan", "name-it"] as const;
export type GroundingExercise = (typeof GROUNDING_EXERCISES)[number];
export const isGroundingExercise = (s: string): s is GroundingExercise => (GROUNDING_EXERCISES as readonly string[]).includes(s);

export const BODY_SCAN_SECONDS = GROUNDING.bodyScanSteps * GROUNDING.bodyScanStepSeconds;

// Where the body scan is after `seconds` of running (paused time not counted): the step
// (0-based) and the whole seconds left in it; done at the end.
export function bodyScanAt(seconds: number): { step: number; left: number; done: boolean } {
  if (seconds >= BODY_SCAN_SECONDS) return { step: GROUNDING.bodyScanSteps - 1, left: 0, done: true };
  const s = Math.max(0, Math.floor(seconds));
  const step = Math.floor(s / GROUNDING.bodyScanStepSeconds);
  return { step, left: GROUNDING.bodyScanStepSeconds - (s % GROUNDING.bodyScanStepSeconds), done: false };
}

// Name it (Ruling 2): chips from the check-in's fixed mood words only, never free text. The
// moods this person has used, in the scale's order; with none yet, the whole list.
export const MOOD_SCALE = [1, 2, 3, 4, 5] as const;
export function nameItMoods(used: unknown): number[] {
  const seen = new Set((Array.isArray(used) ? used : []).map((r) => (typeof r === "object" && r !== null ? (r as { mood?: unknown }).mood : r)));
  const mine = MOOD_SCALE.filter((m) => seen.has(m));
  return mine.length > 0 ? mine : [...MOOD_SCALE];
}
