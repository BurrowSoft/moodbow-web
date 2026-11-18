import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import contract from "./showedUp.contract.json";
import { SHOWED_UP_RANGES, showedUp, showedUpShown, windowStart } from "./showedUp";

describe("Days you showed up: the app's contract (moodbow-app #252, f1d2a8d2)", () => {
  it("is the app's file, byte for byte", () => {
    const bytes = readFileSync(join(__dirname, "showedUp.contract.json"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("2082ee8fe29bc6786ee3c1b2f5fc73d2ad181f9426c53c43aaede262a43685e2");
  });

  it("names the same ranges", () => {
    expect(contract.ranges).toEqual([...SHOWED_UP_RANGES]);
  });

  for (const c of contract.cases as { name: string; today: string; checkIns: [string, number][]; expect: Record<string, number | "hidden"> }[]) {
    it(c.name, () => {
      expect(showedUpShown(c.checkIns.map(([local_date, mood]) => ({ local_date, mood })), c.today)).toEqual(c.expect);
    });
  }
});

describe("Days you showed up: windows", () => {
  it("week, month and 3 months end today; year starts on the 1st, 11 months back", () => {
    expect(windowStart("week", "2026-11-18")).toBe("2026-11-12");
    expect(windowStart("month", "2026-11-18")).toBe("2026-10-20");
    expect(windowStart("threeMonths", "2026-11-18")).toBe("2026-08-21");
    expect(windowStart("year", "2026-11-18")).toBe("2025-12-01");
    expect(windowStart("year", "2027-01-05")).toBe("2026-02-01");
    expect(windowStart("all", "2026-11-18")).toBeNull();
  });

  it("only ever counts: never a streak or a chain in the result", () => {
    expect(showedUp([], "2026-11-18").week).toBe(0);
    const r = showedUp([{ local_date: "2026-11-18", mood: 3 }], "2026-11-18");
    expect(Object.keys(r).sort()).toEqual([...SHOWED_UP_RANGES].sort());
    expect(Object.values(r).every((n) => Number.isInteger(n))).toBe(true);
  });
});
