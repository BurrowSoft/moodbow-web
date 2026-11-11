import { flagsCrisis, type CrisisKeywords } from "@/lib/safety/crisis";

// Tags on a check-in (UX, 11 Nov; free journal data): the person's own
// words, up to 5 a day, each up to 32 characters. The database keeps the same
// rules (check_in_tags, set_check_in_tags in the app's migration); these are
// the clients' half, so the field can say why before anything is sent.

export const TAG_RULES = { perDay: 5, maxChars: 32 } as const;
export type TagProblem = "empty" | "too_long" | "too_many" | "duplicate";

// Trimmed, inner whitespace as one space: how a tag is stored.
export const normalizeTag = (raw: string): string => raw.replace(/\s+/g, " ").trim();
const length = (s: string) => [...s].length;
const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

// Adding one typed or picked tag to the day's list.
export function addTag(tags: readonly string[], raw: string): { tags: string[]; problem: TagProblem | null } {
  const tag = normalizeTag(raw);
  if (!tag) return { tags: [...tags], problem: "empty" };
  if (length(tag) > TAG_RULES.maxChars) return { tags: [...tags], problem: "too_long" };
  if (tags.some((t) => same(t, tag))) return { tags: [...tags], problem: "duplicate" };
  if (tags.length >= TAG_RULES.perDay) return { tags: [...tags], problem: "too_many" };
  return { tags: [...tags, tag], problem: null };
}

// The form's hidden "tags" field (JSON) back to a clean list, or null when it
// breaks a rule: the save is refused, as a bad mood value is.
export function parseTags(value: FormDataEntryValue | null): string[] | null {
  if (value === null || value === "") return [];
  let list: unknown;
  try {
    list = JSON.parse(String(value));
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.some((t) => typeof t !== "string")) return null;
  let out: string[] = [];
  for (const raw of list as string[]) {
    const { tags, problem } = addTag(out, raw);
    if (problem && problem !== "duplicate") return null;
    out = tags;
  }
  return out;
}

// The CSV export's cell: the day's tags joined by " | " (Daylio's separator),
// a "|" inside a tag written as "/".
export const tagsCsvCell = (tags: readonly string[]): string => tags.map((t) => t.replaceAll("|", "/")).join(" | ");

// A Daylio export's activities, as tags (the CSV import, 1.1 K): split on
// "|", each trimmed and cut to 32 characters, the first 5 different ones.
export function activitiesToTags(cell: string): string[] {
  let out: string[] = [];
  for (const part of cell.split("|")) {
    const tag = [...normalizeTag(part)].slice(0, TAG_RULES.maxChars).join("").trim();
    if (!tag || out.length >= TAG_RULES.perDay) continue;
    out = addTag(out, tag).tags;
  }
  return out;
}

// The crisis list reads tags too (UX, 11 Nov), on save, as it reads writing:
// a match offers help and never blocks; nothing about it is stored. Each tag
// alone and all of them together, so a phrase split across tags still counts.
export const tagsFlagCrisis = (tags: readonly string[], keywords: CrisisKeywords | null): boolean =>
  tags.length > 0 && (tags.some((t) => flagsCrisis(t, keywords)) || flagsCrisis(tags.join(" "), keywords));
