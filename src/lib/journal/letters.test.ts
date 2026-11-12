import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dueLetter, forClient, isLetterMonths, LETTER_RULES, letterForToday, parseLetterRows, type LetterRow } from "./letters";

const LANGUAGES = ["en", "fr", "es", "pt-br", "de", "it", "th"] as const;
const strings = (l: string) => (JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")) as { letters: Record<string, string> }).letters;
const row = (over: Partial<LetterRow>): LetterRow => ({ id: "a", body: "Dear me,", written_on: "2026-10-09", opens_on: "2026-11-09", card_from: null, opened_at: null, ...over });

describe("letters rules (content/letters.json)", () => {
  it("are the contract's: 1, 3, 6 or 12 months; a week for Not now", () => {
    expect(LETTER_RULES).toEqual({ monthChoices: [1, 3, 6, 12], maxChars: 20000, notNowDays: 7 });
    expect([0, 1, 2, 3, 6, 12, 24, "1"].map(isLetterMonths)).toEqual([false, true, false, true, true, true, false, false]);
  });

  it("a locked letter reaches the client without its text; an opened one with it", () => {
    expect(forClient(row({}))).toEqual({ id: "a", body: null, writtenOn: "2026-10-09", opensOn: "2026-11-09", opened: false });
    expect(forClient(row({ opened_at: "2026-11-09T08:00:00Z" })).body).toBe("Dear me,");
  });

  it("due on its day, or from card_from after Not now; never once opened; the oldest first", () => {
    const today = "2026-11-09";
    expect(dueLetter([row({ opens_on: "2026-11-10" })], today)).toBeNull();
    expect(dueLetter([row({})], today)?.id).toBe("a");
    expect(dueLetter([row({ card_from: "2026-11-16" })], today)).toBeNull();
    expect(dueLetter([row({ card_from: "2026-11-09" })], today)?.id).toBe("a");
    expect(dueLetter([row({ opened_at: "2026-11-09T08:00:00Z" })], today)).toBeNull();
    // Oldest written first, whatever the opening days (UX 12 Nov; the phone check: written Aug 14,
    // Sep 13, Oct 13, opening yesterday, 3 days ago and 2 days ago: Aug 14 shows).
    expect(
      dueLetter(
        [
          row({ id: "sep", written_on: "2026-09-13", opens_on: "2026-11-06" }),
          row({ id: "aug", written_on: "2026-08-14", opens_on: "2026-11-08" }),
          row({ id: "oct", written_on: "2026-10-13", opens_on: "2026-11-07" }),
        ],
        today,
      )?.id,
    ).toBe("aug");
    // Same day written: the id breaks the tie, by code units, never the runtime's collation
    // (UX 12 Nov): "B" (66) before "a" (97), where a locale compare would put "a" first.
    expect(dueLetter([row({ id: "b", written_on: "2026-08-14" }), row({ id: "a", written_on: "2026-08-14" })], today)?.id).toBe("a");
    expect(dueLetter([row({ id: "a", written_on: "2026-08-14" }), row({ id: "B", written_on: "2026-08-14" })], today)?.id).toBe("B");
    expect(parseLetterRows([row({ id: "a", written_on: "2026-08-14" }), row({ id: "B", written_on: "2026-08-14" })]).map((r) => r.id)).toEqual(["B", "a"]);
  });

  it("anything malformed is left out", () => {
    expect(parseLetterRows([row({}), { id: "b", body: "x", written_on: "soon", opens_on: "2026-11-09" }, null]).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("Today's letter: matched on the server, before it renders (the Reviewer's read)", () => {
  const match = (text: string) => text.includes("a matched phrase");
  it("its text matches: the help offer goes above it; the result never carries the text", () => {
    const today = letterForToday([row({ body: "Dear me, a matched phrase" })], "2026-11-09", false, match);
    expect(today).toEqual({ id: "a", writtenOn: "2026-10-09", helpFirst: true });
    expect(JSON.stringify(today)).not.toContain("Dear me");
  });
  it("no match, an ordinary week: no help offer above it", () => {
    expect(letterForToday([row({})], "2026-11-09", false, match)?.helpFirst).toBe(false);
  });
  it("a hard last week: the help offer above it, whatever the text", () => {
    expect(letterForToday([row({})], "2026-11-09", true, match)?.helpFirst).toBe(true);
  });
  it("none due: nothing", () => {
    expect(letterForToday([row({ opens_on: "2027-01-01" })], "2026-11-09", true, match)).toBeNull();
  });
});

// Locked is a display rule, not encryption (the Reviewer's read): no word says otherwise.
const SEALED: Record<(typeof LANGUAGES)[number], string[]> = {
  en: ["seal", "secure", "encrypt", "safe"],
  fr: ["scell", "sécuris", "chiffr", "coffre"],
  es: ["sellad", "segur", "cifrad", "caja fuerte"],
  "pt-br": ["selad", "segur", "criptograf", "cofre"],
  de: ["versiegel", "sicher", "verschlüssel", "tresor"],
  it: ["sigillat", "sicur", "cifrat", "cassaforte"],
  th: ["ผนึก", "ปลอดภัย", "เข้ารหัส"],
};

describe("letters words, in every language", () => {
  it("every language has en's keys, none empty, with {date} where en has it", () => {
    const en = strings("en");
    for (const l of LANGUAGES) {
      const s = strings(l);
      expect(Object.keys(s).sort(), l).toEqual(Object.keys(en).sort());
      for (const [k, v] of Object.entries(s)) {
        expect(v.trim(), `${l} ${k}`).not.toBe("");
        if (en[k].includes("{date}")) expect(v, `${l} ${k}`).toContain("{date}");
      }
    }
  });

  it("nothing says sealed, secure or encrypted", () => {
    for (const l of LANGUAGES) {
      for (const [k, v] of Object.entries(strings(l))) {
        const text = v.toLocaleLowerCase(l);
        for (const w of SEALED[l]) expect(text.includes(w), `${l} ${k}: "${w}"`).toBe(false);
      }
    }
  });
});
