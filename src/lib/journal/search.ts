// Search your journal (1.1 L, decision 195): entry text only, the user's own
// rows by RLS, newest first, at most 50. Case-insensitive; accents and Thai
// match as typed (v1). The query never goes into a URL, a log or Sentry: it's
// a server action's POST body, and nothing about it is stored.

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
// with … when cut), the matched text as written, and the text after. Case-
// insensitive like the query; line breaks become spaces. Null if there's no
// match (the server matched on something this can't see, e.g. Unicode case).
export type Snippet = { before: string; match: string; after: string };
export function snippet(body: string, q: string, context = 40): Snippet | null {
  const flat = body.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return null;
  let start = Math.max(0, at - context);
  let end = Math.min(flat.length, at + q.length + context);
  if (start > 0) {
    const space = flat.indexOf(" ", start);
    if (space >= 0 && space < at) start = space + 1;
  }
  if (end < flat.length) {
    const space = flat.lastIndexOf(" ", end);
    if (space > at + q.length) end = space;
  }
  return {
    before: `${start > 0 ? "…" : ""}${flat.slice(start, at)}`,
    match: flat.slice(at, at + q.length),
    after: `${flat.slice(at + q.length, end)}${end < flat.length ? "…" : ""}`,
  };
}
