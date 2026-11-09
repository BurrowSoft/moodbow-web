import letters from "../../../content/letters.json";

// Letters to future me (1.2; content/letters.json, the rules both clients run).
export const LETTER_RULES = letters.rules;
export type LetterMonths = 1 | 3 | 6 | 12;

// As the server keeps it. body is null on the client while it's locked: it's never sent.
export type LetterRow = { id: string; body: string; written_on: string; opens_on: string; card_from: string | null; opened_at: string | null };
export type Letter = { id: string; body: string | null; writtenOn: string; opensOn: string; opened: boolean };

export const isLetterMonths = (n: unknown): n is LetterMonths => (LETTER_RULES.monthChoices as unknown[]).includes(n);

const isIso = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

export function parseLetterRows(rows: unknown): LetterRow[] {
  return (Array.isArray(rows) ? rows : [])
    .filter((r): r is LetterRow => typeof r?.id === "string" && typeof r?.body === "string" && isIso(r?.written_on) && isIso(r?.opens_on))
    .map(({ id, body, written_on, opens_on, card_from, opened_at }) => ({ id, body, written_on, opens_on, card_from: isIso(card_from) ? card_from : null, opened_at: typeof opened_at === "string" ? opened_at : null }))
    .sort((a, b) => (a.written_on === b.written_on ? a.id.localeCompare(b.id) : a.written_on < b.written_on ? -1 : 1));
}

// What the client gets: a locked letter's text stays on the server.
export const forClient = (row: LetterRow): Letter => ({ id: row.id, body: row.opened_at ? row.body : null, writtenOn: row.written_on, opensOn: row.opens_on, opened: row.opened_at !== null });

// Today's card: the oldest locked letter whose day has come (opens_on, or card_from after Not now).
export function dueLetter(rows: LetterRow[], today: string): LetterRow | null {
  return rows.filter((r) => !r.opened_at && r.opens_on <= today && (r.card_from === null || r.card_from <= today)).sort((a, b) => (a.opens_on < b.opens_on ? -1 : a.opens_on > b.opens_on ? 1 : 0))[0] ?? null;
}

// Today's letter (1.2): the due one, matched here on the server against the current crisis
// list before anything renders (nothing about it is stored), and returned without its text.
// helpFirst: a match, or a hard last week (Your week's rule): the help offer goes above it.
export function letterForToday(rows: LetterRow[], today: string, hardWeek: boolean, matches: (text: string) => boolean): { id: string; writtenOn: string; helpFirst: boolean } | null {
  const due = dueLetter(rows, today);
  return due ? { id: due.id, writtenOn: due.written_on, helpFirst: hardWeek || matches(due.body) } : null;
}
