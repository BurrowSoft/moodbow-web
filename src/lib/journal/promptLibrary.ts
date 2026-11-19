import contract from "../../../content/contracts/prompts-library.json";
import { promptText, type Prompt } from "./prompts";

// The prompt library (Plus wave 2; UX, 12 Nov; specs/plus-prompts-draft.md): 30 prompts in five
// groups, from the shared list (content/contracts/prompts-library.json, the same on the app).
// Hard days is free for everyone and shows Get help now (its "plus" and "help"); the other four
// are Plus. The same rules as the free prompts: only above an empty entry, never on a day the
// crisis matcher flagged (the Write page's promptDate), the UI language's text else English.
// Each group goes in list order, resuming where the person left off, kept on this device.

export type LibraryGroupId = "noticing" | "gratitude" | "hard-days" | "relationships" | "ahead";
export type LibraryGroup = { id: LibraryGroupId; plus: boolean; help: boolean; prompts: Prompt[] };
export const LIBRARY: LibraryGroup[] = contract.groups as LibraryGroup[];

// Its group's prompt at a place, wrapping round.
export function libraryPrompt(group: LibraryGroup, place: number): Prompt {
  const n = group.prompts.length;
  return group.prompts[((place % n) + n) % n];
}

export const libraryText = promptText;

// Open to this person: a free group always; a Plus one only with Plus.
export const groupOpen = (group: LibraryGroup, hasPlus: boolean): boolean => !group.plus || hasPlus;

// Where each group was left, per person on this device: { "<uid>": { "<group>": place } }.
export const LIBRARY_PLACE_KEY = "mb:prompt-library";

function readAll(): Record<string, Record<string, number>> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LIBRARY_PLACE_KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Record<string, number>>) : {};
  } catch {
    return {};
  }
}

export function readPlace(uid: string, group: LibraryGroupId): number {
  const place = readAll()[uid]?.[group];
  return typeof place === "number" && Number.isInteger(place) && place >= 0 ? place : 0;
}

export function savePlace(uid: string, group: LibraryGroupId, place: number): void {
  try {
    const all = readAll();
    all[uid] = { ...(all[uid] ?? {}), [group]: place };
    window.localStorage.setItem(LIBRARY_PLACE_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: it starts from the top next time.
  }
}
