import contract from "../../../content/contracts/search-fold.json";

// Search ignores accents and case (content/contracts/search-fold.json, the
// app's). The server's search_entries (migration 014) is the rule; the web
// mirrors it only to bold the match in a snippet. If it can't place a match
// (unaccent also maps rare symbols the table leaves out), the caller shows the
// snippet with no bold, never a wrong bold.
const FOLD = new Map(Object.entries(contract.fold).flatMap(([from, to]) => [...from].map((c) => [c, to] as const)));
const isMark = (unit: number) => unit >= 0x0300 && unit <= 0x036f;

// Each UTF-16 unit on its own (as the app's Dart strings): lower-case, the
// table, combining marks dropped. origin has one index into `s` per folded
// character, plus s.length at the end.
export function foldForSearch(s: string): { text: string; origin: number[] } {
  let text = "";
  const origin: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (isMark(s.charCodeAt(i))) continue;
    const lower = s[i].toLowerCase();
    const folded = FOLD.get(lower) ?? lower;
    text += folded;
    for (let k = 0; k < folded.length; k++) origin.push(i);
  }
  origin.push(s.length);
  return { text, origin };
}

// Where `query` matches in `body`, as [start, end) indexes into body (a match
// ending on a letter keeps that letter's combining marks), or null.
export function findFolded(body: string, query: string): [number, number] | null {
  const q = foldForSearch(query).text;
  if (!q) return null;
  const b = foldForSearch(body);
  const i = b.text.indexOf(q);
  if (i < 0) return null;
  let end = b.origin[i + q.length - 1] + 1;
  while (end < body.length && isMark(body.charCodeAt(end))) end++;
  return [b.origin[i], end];
}
