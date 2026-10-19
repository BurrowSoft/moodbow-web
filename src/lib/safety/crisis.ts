// The M8 after-save check (decisions 124/125; rules in the shared contract
// content/contracts/crisis-keywords.json, written by UX in
// specs/crisis-keywords-1.0.md). It runs in the browser only: nothing about
// a match is sent, stored, logged or reported anywhere. A match only opens
// the safety card.

export type CrisisKeywords = {
  version: number;
  languages: Record<string, { match: "word" | "substring"; phrases: string[] }>;
};

const APOSTROPHES = /[’‘ʼ]/g;
// Anything that isn't a letter, a digit or a Thai character becomes a
// space (Thai vowel and tone marks are combining marks, so they're kept by
// the Thai block, not \p{L}).
const SEPARATORS = /[^\p{L}\p{N}฀-๿]+/gu;
const COMBINING = /\p{M}/gu;

// Rule 1, and rule 2 (diacritics stripped) for the Latin-script lists only.
export function normalizeForCrisis(text: string, stripMarks: boolean): string {
  let s = text.normalize("NFKC").toLowerCase().replace(APOSTROPHES, "'").replace(/'/g, "");
  if (stripMarks) s = s.normalize("NFD").replace(COMBINING, "");
  return s.replace(SEPARATORS, " ").trim();
}

// Rules 3–5: every list, whatever the UI language; whole words for "word"
// lists (diacritics stripped), substrings for "substring" lists (Thai,
// marks kept). No keywords (the contract not synced yet) → never a match.
export function flagsCrisis(text: string, keywords: CrisisKeywords | null): boolean {
  if (!keywords || !text.trim()) return false;
  const words = ` ${normalizeForCrisis(text, true)} `;
  const raw = normalizeForCrisis(text, false);
  for (const list of Object.values(keywords.languages)) {
    for (const phrase of list.phrases) {
      if (list.match === "substring") {
        const p = normalizeForCrisis(phrase, false);
        if (p && raw.includes(p)) return true;
      } else {
        const p = normalizeForCrisis(phrase, true);
        if (p && words.includes(` ${p} `)) return true;
      }
    }
  }
  return false;
}
