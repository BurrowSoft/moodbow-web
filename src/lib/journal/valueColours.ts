import colourMap from "../../../content/contracts/colour-map.json";

// The Sunrise scale for the person's own check-in values (decisions 149/150,
// specs/colour-roles.md §1), from the shared contract colour-map.json: each
// stored value maps to a step 1–5, the step to its colour. The one place
// the five colours live on the web (a guard test keeps it that way). Never
// for journal text, moments, Moodbow's voice, buttons or links, and never
// for averages: only stored values.
export type ValueKey = keyof typeof colourMap.values;
type Rule = { eq?: number; lt?: number; lte?: number; step: number | null };

// Steps 1 → 5 (blue = low, gold = high).
export const STEP_HEX = ["1", "2", "3", "4", "5"].map((s) => colourMap.steps[s as keyof typeof colourMap.steps]);

// The first rule whose conditions all hold; null = neutral (no colour:
// movement 0, no guilt).
export function valueStep(key: ValueKey, value: number | string): number | null {
  const v = Number(value);
  for (const rule of colourMap.values[key] as Rule[]) {
    if ((rule.eq === undefined || v === rule.eq) && (rule.lt === undefined || v < rule.lt) && (rule.lte === undefined || v <= rule.lte)) return rule.step;
  }
  return null;
}

export function valueHex(key: ValueKey, value: number | string): string | null {
  const step = valueStep(key, value);
  return step === null ? null : STEP_HEX[step - 1];
}

// Mood 1 → 5 as Tailwind classes (the picker, the Timeline): written out so
// Tailwind sees them; a test pins them to STEP_HEX.
export const MOOD_COLOURS = ["bg-[#7f8cb8]", "bg-[#a99bd1]", "bg-[#e6c7d3]", "bg-[#f4a77a]", "bg-[#f3c24f]"] as const;
// The 1 px outline every coloured circle (and bar) keeps: the muted token,
// ≥ 3:1 on every surface in both themes.
export const MOOD_DOT_OUTLINE = "border border-muted";
