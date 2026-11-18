import { LIBRARY, type LibraryGroup, type LibraryGroupId } from "./promptLibrary";
import { PROMPTS, daysSinceEpoch, type Prompt } from "./prompts";

// Prompts that follow your mood (1.4 E; specs/1.4-features.md §E, UX 18 Nov; the cases in
// moodPrompts.contract.json, which the Mobile Dev moves into moodbow-app's supabase/contracts):
// - a day the crisis matcher flagged (an entry or a tag): no prompt at all (the page decides);
// - no check-in today: prompts.json's daily prompt, "Another" stepping through the daily list;
// - today's check-in mood (its current value, so an edit later that day moves the group):
//   1-2 hard-days, 3 noticing, 4-5 gratitude;
// - Free: one prompt a day, the group's [dayNumber(today) mod length]; "Another" falls back to the
//   daily list from the day's own prompt on, never a second group prompt (no list unlocked);
// - Plus: the group from the person's saved place on this device (the library's), "Another"
//   stepping on and saving it;
// - hard-days keeps its help (the library's "help"), never counted. No new analytics.
export const MOOD_GROUP: Record<1 | 2 | 3 | 4 | 5, LibraryGroupId> = { 1: "hard-days", 2: "hard-days", 3: "noticing", 4: "gratitude", 5: "gratitude" };

export type MoodPromptInput = { today: string; mood: number | null; flagged: boolean; plus: boolean; place?: number; another?: number };
export type MoodPromptResult =
  | { source: "none" }
  | { source: "daily"; prompt: Prompt; help: false }
  | { source: "group"; group: LibraryGroupId; prompt: Prompt; help: boolean; savedPlace?: number };

const mod = (a: number, n: number) => ((a % n) + n) % n;
const groupOf = (id: LibraryGroupId): LibraryGroup => LIBRARY.find((g) => g.id === id)!;

export function moodGroup(mood: number | null | undefined): LibraryGroupId | null {
  return typeof mood === "number" && Number.isInteger(mood) && mood >= 1 && mood <= 5 ? MOOD_GROUP[mood as 1 | 2 | 3 | 4 | 5] : null;
}

export function moodPrompt({ today, mood, flagged, plus, place = 0, another = 0 }: MoodPromptInput): MoodPromptResult {
  if (flagged) return { source: "none" };
  const day = daysSinceEpoch(today);
  const id = moodGroup(mood);
  if (id === null) return { source: "daily", prompt: PROMPTS[mod(day + another, PROMPTS.length)], help: false };
  const group = groupOf(id);
  if (plus) return { source: "group", group: id, prompt: group.prompts[mod(place + another, group.prompts.length)], help: group.help, savedPlace: place + another };
  if (another === 0) return { source: "group", group: id, prompt: group.prompts[mod(day, group.prompts.length)], help: group.help };
  return { source: "daily", prompt: PROMPTS[mod(day + another - 1, PROMPTS.length)], help: false };
}
