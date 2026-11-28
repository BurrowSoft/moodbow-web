// @vitest-environment node
import { describe, expect, it } from "vitest";
import contract from "../../../content/contracts/patterns.json";
import type { InsightRow } from "./insights";
import { routinePatterns, type RoutineItem } from "./patterns";

// patterns.json version 2 (1.4 F): its routineCases, the app's contract (content/contracts, synced from moodbow-app
// master 2a2c5812; first drafted by scripts/gen-patterns-v2.mjs). Its version-1 rules and cases are patterns.test's.
type RoutineCase = { name: string; rows: InsightRow[]; routine: RoutineItem[]; expect: unknown };

describe("patterns.json v2: routine", () => {
  for (const c of contract.routineCases as unknown as RoutineCase[]) {
    it(c.name, () => {
      expect(routinePatterns(c.rows, contract.today, c.routine)).toEqual(c.expect);
    });
  }

  it("never a lower or same line: only shown carries numbers", () => {
    for (const c of contract.routineCases as unknown as RoutineCase[])
      for (const p of routinePatterns(c.rows, contract.today, c.routine)) {
        if (p.state === "shown") expect(p.diff).toBeGreaterThanOrEqual(contract.rules.sameBelow);
        else expect([p.a, p.b, p.diff]).toEqual([null, null, null]);
      }
  });

  it("the footnote warns about medication", () => {
    expect(contract.copy.routineFootnote).toMatch(/medication/);
  });
});
