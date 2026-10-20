import contract from "../../../content/contracts/prompts.json";

// Writing prompts (1.1 I, decision 183): one quiet invitation above an empty
// entry, from the shared list (content/contracts/prompts.json, the same on
// the app). Today's is the date's day number since 1970-01-01 (the profile's
// date) mod the list's length; "Another" steps to the next, wrapping round.
export type Prompt = { id: string; en: string; th?: string };
export const PROMPTS: Prompt[] = contract.prompts;

export function daysSinceEpoch(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);
}

// The prompt for a date, `step` places after that day's own.
export function promptFor(isoDate: string, step = 0): Prompt {
  const n = PROMPTS.length;
  const i = (((daysSinceEpoch(isoDate) + step) % n) + n) % n;
  return PROMPTS[i];
}

// Its text in the UI language, else English.
export const promptText = (p: Prompt, language: string): string => (language === "th" && p.th ? p.th : p.en);
