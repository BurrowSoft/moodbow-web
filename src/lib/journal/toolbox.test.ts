import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import contract from "../../../content/contracts/toolbox.json";
import yourWeek from "../../../content/your-week.json";
import { breathingAt, cycleSeconds, FREE_PATTERN, parseToolboxItems, patternById, patternSeconds, PATTERNS, TOOLBOX_RULES, toolboxCardShows, toolboxLength, toolboxProblem } from "./toolbox";

const LANGUAGES = ["en", "fr", "es", "pt-br", "de", "it", "th"] as const;
const strings = (l: string) => (JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")) as { toolbox: Record<string, string> }).toolbox;

describe("toolbox rules (content/contracts/toolbox.json)", () => {
  it("are the contract's: 20 items of 120 characters, low moods 1 and 2", () => {
    expect(TOOLBOX_RULES).toEqual({ maxItems: 20, maxChars: 120, lowMoods: [1, 2] });
  });

  it("blank, too long and full, as the server checks them; an emoji is one character", () => {
    expect(toolboxProblem("   ", 0, true)).toBe("empty");
    expect(toolboxProblem("a".repeat(120), 0, true)).toBeNull();
    expect(toolboxProblem("a".repeat(121), 0, true)).toBe("tooLong");
    expect(toolboxLength("🙂".repeat(120))).toBe(120);
    expect(toolboxProblem("🙂".repeat(120), 0, true)).toBeNull();
    expect(toolboxProblem("Walk", 19, true)).toBeNull();
    expect(toolboxProblem("Walk", 20, true)).toBe("full");
    // An edit never adds one.
    expect(toolboxProblem("Walk", 20, false)).toBeNull();
  });

  it("the card: the latest check-in today is 1 or 2; 3 or more, or none, no card", () => {
    expect([null, 1, 2, 3, 4, 5].map(toolboxCardShows)).toEqual([false, true, true, false, false, false]);
  });

  it("the list in its order, anything malformed left out", () => {
    expect(
      parseToolboxItems([
        { id: "b", text: "Text Sam", position: 1, user_id: "x" },
        { id: "a", text: "Walk", position: 0 },
        { id: "c", text: null, position: 2 },
      ]),
    ).toEqual([
      { id: "a", text: "Walk", position: 0 },
      { id: "b", text: "Text Sam", position: 1 },
    ]);
    expect(parseToolboxItems(null)).toEqual([]);
  });
});

// The breathing patterns (contract v2; specs/plus-breathing-draft.md, UX's rulings 12 Nov).
describe("breathing patterns", () => {
  it("today's free, then Box and Slow and even for Plus", () => {
    expect(PATTERNS.map((p) => [p.id, p.plus])).toEqual([["even-4-6", false], ["box", true], ["even-5", true]]);
    expect(FREE_PATTERN.id).toBe("even-4-6");
    expect(patternById("box")?.id).toBe("box");
    expect(patternById("4-7-8")).toBeNull();
    expect(patternById(null)).toBeNull();
  });

  it("the rules: in, out or hold; no hold over 4 s; about a minute (55–65 s) in whole cycles; one free, first", () => {
    for (const p of PATTERNS) {
      for (const [step, seconds] of p.steps) {
        expect(["in", "out", "hold"], p.id).toContain(step);
        expect(Number.isInteger(seconds) && seconds > 0, p.id).toBe(true);
        if (step === "hold") expect(seconds, `${p.id}: a hold`).toBeLessThanOrEqual(4);
      }
      expect(patternSeconds(p), p.id).toBeGreaterThanOrEqual(55);
      expect(patternSeconds(p), p.id).toBeLessThanOrEqual(65);
    }
    expect(PATTERNS.filter((p) => !p.plus)).toEqual([PATTERNS[0]]);
  });

  it("today's is unchanged: in for 4, out for 6, six times, 60 s", () => {
    expect(FREE_PATTERN.steps).toEqual([["in", 4], ["out", 6]]);
    expect(patternSeconds(FREE_PATTERN)).toBe(60);
    expect(patternSeconds(patternById("box")!)).toBe(64);
    expect(patternSeconds(patternById("even-5")!)).toBe(60);
  });

  it("each second's step and the seconds left, for the words shown with reduced motion (today's)", () => {
    const first = Array.from({ length: 10 }, (_, s) => breathingAt(s)).map(({ phase, left }) => ({ phase, left }));
    expect(first).toEqual([
      { phase: "in", left: 4 },
      { phase: "in", left: 3 },
      { phase: "in", left: 2 },
      { phase: "in", left: 1 },
      { phase: "out", left: 6 },
      { phase: "out", left: 5 },
      { phase: "out", left: 4 },
      { phase: "out", left: 3 },
      { phase: "out", left: 2 },
      { phase: "out", left: 1 },
    ]);
    expect(breathingAt(50)).toMatchObject({ phase: "in", left: 4 });
    expect(breathingAt(59)).toMatchObject({ phase: "out", left: 1 });
  });

  it("Box: a hold after breathing in keeps the circle full, after breathing out keeps it small", () => {
    const box = patternById("box")!;
    expect(cycleSeconds(box)).toBe(16);
    expect(breathingAt(0, box)).toEqual({ phase: "in", left: 4, held: null, of: 4 });
    expect(breathingAt(4, box)).toEqual({ phase: "hold", left: 4, held: "in", of: 4 });
    expect(breathingAt(8, box)).toEqual({ phase: "out", left: 4, held: null, of: 4 });
    expect(breathingAt(12, box)).toEqual({ phase: "hold", left: 4, held: "out", of: 4 });
    expect(breathingAt(15, box)).toMatchObject({ phase: "hold", left: 1, held: "out" });
    expect(breathingAt(16, box)).toMatchObject({ phase: "in", left: 4 });
    expect(breathingAt(63, box)).toMatchObject({ phase: "hold", left: 1 });
  });
});

describe("toolbox words, in every language (the Reviewer's read)", () => {
  it("every language has exactly en's keys, none empty, the same {n} in the counts", () => {
    const en = strings("en");
    for (const l of LANGUAGES) {
      const s = strings(l);
      expect(Object.keys(s).sort(), l).toEqual(Object.keys(en).sort());
      for (const [k, v] of Object.entries(s)) expect(v.trim(), `${l} ${k}`).not.toBe("");
      for (const k of ["breatheInCount", "breatheOutCount", "breatheHoldCount"]) expect(s[k], `${l} ${k}`).toContain("{n}");
    }
  });

  it("no claim about what breathing does, no treatment words, no diagnosis words", () => {
    for (const l of LANGUAGES) {
      const words = [...contract.claimWords[l], ...(yourWeek.diagnosisWords as Record<string, string[]>)[l]];
      for (const [k, v] of Object.entries(strings(l))) {
        const text = v.toLocaleLowerCase(l);
        for (const w of words) expect(text.includes(w.toLocaleLowerCase(l)), `${l} ${k}: "${w}"`).toBe(false);
      }
    }
  });

  it("the limits say the contract's numbers", () => {
    for (const l of LANGUAGES) {
      expect(strings(l).limitCount, l).toContain(String(TOOLBOX_RULES.maxItems));
      expect(strings(l).limitLength, l).toContain(String(TOOLBOX_RULES.maxChars));
    }
  });
});
