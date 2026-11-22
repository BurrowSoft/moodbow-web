// @vitest-environment node
import { describe, expect, it } from "vitest";
import contract from "../../../content/contracts/patterns.json";
import en from "@/messages/en.json";
import type { InsightRow } from "./insights";
import { PATTERN_RULES, patterns, patternsWindowStart } from "./patterns";

// content/contracts/patterns.json (synced from the app, decision 99): the
// app and the web compute every case identically, byte for byte.
type Case = { name: string; rows: InsightRow[]; expect: unknown };

describe("Patterns (no AI): the shared contract", () => {
  it("the rules are the contract's", () => {
    expect(PATTERN_RULES).toEqual(contract.rules);
  });

  for (const c of contract.cases as unknown as Case[]) {
    it(c.name, () => {
      expect(patterns(c.rows, contract.today)).toEqual(c.expect);
    });
  }

  it("the web's copy is the contract's, word for word", () => {
    const keys = {
      title: "patternsTitle",
      subtitle: "patternsSubtitle",
      sleepShown: "patternsSleepShown",
      sleepSame: "patternsSleepSame",
      movementShown: "patternsMovementShown",
      movementSame: "patternsMovementSame",
      stressShown: "patternsStressShown",
      stressSame: "patternsStressSame",
      footnote: "patternsFootnote",
      none: "patternsNone",
    } as const;
    // v2 (1.4 F) adds Routine's two lines, which the web keeps with Routine's own strings.
    const routineKeys = { routineShown: "patternShown", routineFootnote: "patternFootnote" } as const;
    expect(Object.keys(contract.copy).sort()).toEqual([...Object.keys(keys), ...Object.keys(routineKeys)].sort());
    for (const [from, key] of Object.entries(keys)) expect(en.insights[key], key).toBe(contract.copy[from as keyof typeof keys]);
    for (const [from, key] of Object.entries(routineKeys)) expect(en.routine[key], `routine.${key}`).toBe(contract.copy[from as keyof typeof routineKeys]);
  });

  it("the page's read starts on the window's first day (today − 89)", () => {
    expect(patternsWindowStart("2026-11-04")).toBe("2026-08-07");
  });
});
