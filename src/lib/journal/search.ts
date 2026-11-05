// Search your journal (1.1 L, decision 195): entry text only, the user's own
// rows by RLS, newest first, at most 50. Accents and case don't matter
// (search_entries, migration 014; Thai matches as typed). The query never goes
// into a URL, a log or Sentry: it's a server action's POST body, and nothing
// about it is stored.
import { findFolded } from "./searchFold";

export const SEARCH_MIN = 2;
export const SEARCH_MAX_RESULTS = 50;
// A sensible ceiling for what someone types into a search box.
export const SEARCH_MAX_CHARS = 100;
export const SEARCH_DEBOUNCE_MS = 300;

// The typed text as a search: trimmed, then cut to its first 100 characters
// (as search_entries does, so the app, the web and the server agree; L2), or
// null when it's too short. Characters are code points, as Postgres counts
// them, so an emoji at the cut is never split in half.
export function searchTerm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const chars = [...raw.trim()];
  return chars.length >= SEARCH_MIN ? chars.slice(0, SEARCH_MAX_CHARS).join("") : null;
}

// One line around the first match: the text before (cut to a word boundary,
// with … when cut), the matched text as written, and the text after. Ignores
// accents and case like the query (searchFold); line breaks become spaces.
// Null if the match can't be placed (the server matched on something the
// fold table leaves out): the caller shows the entry with no bold.
export type Snippet = { before: string; match: string; after: string };
export function snippet(body: string, q: string, context = 40): Snippet | null {
  const flat = body.replace(/\s+/g, " ").trim();
  const found = findFolded(flat, q.replace(/\s+/g, " ").trim());
  if (!found) return null;
  const [at, matchEnd] = found;
  let start = Math.max(0, at - context);
  let end = Math.min(flat.length, matchEnd + context);
  if (start > 0) {
    const space = flat.indexOf(" ", start);
    if (space >= 0 && space < at) start = space + 1;
  }
  if (end < flat.length) {
    const space = flat.lastIndexOf(" ", end);
    if (space >= matchEnd) end = space;
  }
  return {
    before: `${start > 0 ? "…" : ""}${flat.slice(start, at)}`,
    match: flat.slice(at, matchEnd),
    after: `${flat.slice(matchEnd, end)}${end < flat.length ? "…" : ""}`,
  };
}
