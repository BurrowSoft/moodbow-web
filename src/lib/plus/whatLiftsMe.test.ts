// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import conditions from "../../../content/conditions.json";
import contract from "../../../content/what-lifts-me.json";
import type { InsightRow } from "@/lib/journal/insights";
import { excludedTag, LIFTS_RULES, whatLiftsMe } from "./whatLiftsMe";

// What lifts me (1.3 part 2 and its rulings; content/what-lifts-me.json, shared with the app).
const TODAY = "2026-11-14";
const day = (n: number) => new Date(Date.UTC(2026, 10, 14 - n)).toISOString().slice(0, 10);
const row = (n: number, mood: number) => ({ local_date: day(n), mood }) as InsightRow;
// days: [mood, tags][] counted back from today.
const build = (days: [number, string[]][]) => ({
  rows: days.map(([mood], i) => row(i, mood)),
  tags: new Map(days.map(([, tags], i) => [day(i), tags])),
});
const run = (days: [number, string[]][], keywords: Parameters<typeof whatLiftsMe>[4] = null) => {
  const { rows, tags } = build(days);
  return whatLiftsMe(rows, TODAY, "year", tags, keywords);
};
const repeat = <T,>(n: number, v: T): T[] => Array.from({ length: n }, () => v);

describe("the rules (content/what-lifts-me.json)", () => {
  it("are the spec's: 5 days with, 5 without, a gap of 0.3 or more, at most 3", () => {
    expect(LIFTS_RULES).toEqual({ minDaysWith: 5, minDaysWithout: 5, minGap: 0.3, max: 3 });
  });

  it("a tag on 5 days whose mood is higher by 0.3 or more: shown with both averages", () => {
    const lifts = run([...repeat(5, [4, ["walk"]] as [number, string[]]), ...repeat(5, [3, []] as [number, string[]])]);
    expect(lifts).toEqual([{ tag: "walk", a: { days: 5, mood: 4 }, b: { days: 5, mood: 3 }, gap: 1 }]);
  });

  it("4 days with it, or 4 without: not enough", () => {
    expect(run([...repeat(4, [5, ["walk"]] as [number, string[]]), ...repeat(9, [2, []] as [number, string[]])])).toEqual([]);
    expect(run([...repeat(9, [5, ["walk"]] as [number, string[]]), ...repeat(4, [2, []] as [number, string[]])])).toEqual([]);
  });

  it("a gap under 0.3, or a lower mood with the tag: never shown (no negative framing)", () => {
    // 3.2 against 3.0: 0.2.
    const small = [...repeat(4, [3, ["tea"]] as [number, string[]]), [4, ["tea"]] as [number, string[]], ...repeat(5, [3, []] as [number, string[]])];
    expect(run(small)).toEqual([]);
    expect(run([...repeat(5, [2, ["work"]] as [number, string[]]), ...repeat(5, [4, []] as [number, string[]])])).toEqual([]);
  });

  it("largest gap first", () => {
    // x: 5 days at 5; y: 5 at 4; 20 other days at 3. x: 5 against 3.2 (1.8); y: 4 against 3.4 (0.6).
    const days: [number, string[]][] = repeat(5, [5, ["x"]] as [number, string[]]);
    days.push(...repeat(5, [4, ["y"]] as [number, string[]]), ...repeat(20, [3, []] as [number, string[]]));
    expect(run(days).map((l) => [l.tag, l.gap])).toEqual([
      ["x", 1.8],
      ["y", 0.6],
    ]);
  });

  it("at most three; the same gap: alphabetical", () => {
    // Four tags, alike and on separate days: the same gap each, so the first three by name.
    const days: [number, string[]][] = [];
    for (const tag of ["d", "b", "c", "a"]) days.push(...repeat(5, [5, [tag]] as [number, string[]]));
    days.push(...repeat(20, [3, []] as [number, string[]]));
    const lifts = run(days);
    expect(lifts.map((l) => l.tag)).toEqual(["a", "b", "c"]);
    expect(new Set(lifts.map((l) => l.gap)).size).toBe(1);
  });

  // Parity with the app (UX 14 Nov): sum, then divide, then round half away from zero to one
  // decimal, each side; the gap from the rounded sides. 4.35 → 4.4 and 3.45 → 3.5, so 0.9.
  it("an average ending in 5 rounds up, each side, before the gap", () => {
    const days: [number, string[]][] = [...repeat(13, [4, ["walk"]] as [number, string[]]), ...repeat(7, [5, ["walk"]] as [number, string[]]), ...repeat(11, [3, []] as [number, string[]]), ...repeat(9, [4, []] as [number, string[]])];
    expect(run(days)).toEqual([{ tag: "walk", a: { days: 20, mood: 4.4 }, b: { days: 20, mood: 3.5 }, gap: 0.9 }]);
  });

  // Names by code units, not the locale's order: "Zebra" (Z, U+005A) before "apple" (a, U+0061),
  // and "Éclair" (É, U+00C9) after both, as the app's compare has them.
  it("the same gap and days: names by plain code units", () => {
    const days: [number, string[]][] = [];
    for (const tag of ["apple", "Éclair", "Zebra"]) days.push(...repeat(5, [5, [tag]] as [number, string[]]));
    days.push(...repeat(20, [3, []] as [number, string[]]));
    expect(run(days).map((l) => l.tag)).toEqual(["Zebra", "apple", "Éclair"]);
  });

  it("a day's tag counts once; only the period's checked-in days count", () => {
    const { rows, tags } = build([...repeat(5, [5, ["walk", "walk"]] as [number, string[]]), ...repeat(5, [3, []] as [number, string[]])]);
    expect(whatLiftsMe(rows, TODAY, "year", tags, null)[0].a.days).toBe(5);
    const old = [...rows.map((r) => ({ ...r, local_date: `2024-${r.local_date.slice(5)}` }))];
    const oldTags = new Map([...tags].map(([d, t]) => [`2024-${d.slice(5)}`, t]));
    expect(whatLiftsMe(old, TODAY, "year", oldTags, null)).toEqual([]);
    expect(whatLiftsMe(old, TODAY, "all", oldTags, null)).toHaveLength(1);
  });

  it("a tag the crisis matcher flags: never shown, in any language", () => {
    const keywords = { version: 1, languages: { en: { match: "word" as const, phrases: ["self harm"] } } };
    expect(run([...repeat(5, [5, ["self harm"]] as [number, string[]]), ...repeat(5, [3, []] as [number, string[]])], keywords)).toEqual([]);
  });

  it("a tag on the substances and eating list: never shown", () => {
    expect(run([...repeat(5, [5, ["Wine night"]] as [number, string[]]), ...repeat(5, [3, []] as [number, string[]])])).toEqual([]);
  });
});

describe("the substances and eating list, in every language", () => {
  const LANGUAGES = ["en", "fr", "es", "pt-br", "de", "it", "th"];
  it("has each language, with lower-case, non-empty entries", () => {
    expect(Object.keys(contract.exclude).sort()).toEqual([...LANGUAGES].sort());
    for (const [l, list] of Object.entries(contract.exclude as Record<string, Record<string, string[]>>)) {
      const all = Object.values(list).flat();
      expect(all.length, l).toBeGreaterThan(10);
      for (const w of all) expect(w, l).toBe(w.toLowerCase().trim());
    }
  });

  // Each: alcohol and drink, drugs, smoking and vaping, skipping meals and fasting.
  const HIDDEN: Record<string, string[]> = {
    en: ["Beers with Sam", "drinking", "weed", "Smoking", "vape", "fasting", "skipped lunch", "gin"],
    fr: ["apéro", "Bière", "vin", "joint", "fumer", "clope", "jeûne", "sauter le déjeuner", "gueule de bois"],
    es: ["cerveza", "bebida", "porro", "fumar", "vapeo", "ayuno", "saltar comida", "resaca"],
    "pt-br": ["cerveja", "bebida", "maconha", "fumei", "cigarro", "jejum", "pulei o almoço", "ressaca"],
    de: ["Bier", "Wein", "betrunken", "kiffen", "Rauchen", "Fasten", "Mahlzeit ausgelassen", "Kater"],
    it: ["birra", "vino", "spritz", "canna", "fumare", "svapo", "digiuno", "saltato il pranzo"],
    th: ["ดื่มเบียร์", "เมา", "กัญชา", "สูบบุหรี่", "อดอาหาร", "ข้ามมื้อเช้า"],
  };
  // Everyday tags that must stay: words that only look like the list.
  const KEPT: Record<string, string[]> = {
    en: ["walk", "friends", "Work", "gym", "breakfast", "ginger tea", "podcast", "potluck"],
    fr: ["bureau", "vingt minutes", "amis", "soleil", "marche"],
    es: ["bebé", "amigos", "trabajo", "paseo"],
    "pt-br": ["bebê", "podcast", "amigos", "caminhada", "trabalho"],
    de: ["Spaziergang", "Freunde", "Arbeit", "Sport"],
    it: ["salute", "amici", "lavoro", "passeggiata"],
    th: ["เดินเล่น", "เพื่อน", "ทำงาน"],
  };
  for (const l of LANGUAGES) {
    it(`${l}: each kind is hidden; everyday words stay`, () => {
      for (const tag of HIDDEN[l]) expect(excludedTag(tag), `${l} hides "${tag}"`).toBe(true);
      for (const tag of KEPT[l]) expect(excludedTag(tag), `${l} keeps "${tag}"`).toBe(false);
    });
  }
});

describe("strings", () => {
  const plus = (l: string) => (JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")) as { plus: Record<string, string> }).plus;
  it("en is the spec's copy", () => {
    const p = plus("en");
    expect([p.liftsTitle, p.liftsRow, p.liftsFooter, p.liftsNone]).toEqual([
      "What lifts me",
      "On days with “{tag}”, your mood averaged {a}; on other days, {b}.",
      "Patterns, not causes. Only you can see this.",
      "Keep tagging your days. Patterns show up after a few weeks.",
    ]);
  });
  it("every language has the four, its row with {tag}, {a} and {b}; nothing negative or advising in en", () => {
    for (const l of ["en", "fr", "es", "pt-br", "de", "it", "th"]) {
      const p = plus(l);
      for (const k of ["liftsTitle", "liftsRow", "liftsFooter", "liftsNone"]) expect(p[k]?.trim(), `${l} ${k}`).toBeTruthy();
      for (const ph of ["{tag}", "{a}", "{b}"]) expect(p.liftsRow, `${l} ${ph}`).toContain(ph);
      // The tag in that language's own quotes, as Your tags shows it (UX 14 Nov).
      expect(p.liftsRow, `${l} quotes the tag`).toMatch(/["“«„]\s?\{tag\}\s?["”»“]/);
    }
    expect(Object.values(plus("en")).filter((v) => /brings? you down|you should|try to/i.test(v))).toEqual([]);
  });
});

// It ships with 1.3, not with the Plus stack (UX 14 Nov): its own switch, unmet for now.
it("lifts-live is its own switch, not met yet", () => {
  expect(conditions["lifts-live"].met).toBe(false);
});
