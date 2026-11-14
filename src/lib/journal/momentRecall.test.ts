import { describe, expect, it } from "vitest";
import { parseRecall, toggleRecall } from "./momentRecall";
import { pickOnThisDay, type MomentRow } from "./onThisDay";

describe("Memories: Bring this back (034)", () => {
  it("parseRecall: a sorted subset of 1, 6, 12; missing or unreadable is all three", () => {
    expect(parseRecall(undefined)).toEqual([1, 6, 12]);
    expect(parseRecall("x")).toEqual([1, 6, 12]);
    expect(parseRecall([12, 1, 3])).toEqual([1, 12]);
    expect(parseRecall([])).toEqual([]);
  });
  it("toggleRecall keeps the order", () => {
    expect(toggleRecall([1, 6, 12], 6)).toEqual([1, 12]);
    expect(toggleRecall([12], 1)).toEqual([1, 12]);
  });

  const TODAY = "2026-11-14";
  const moment = (date: string, recall_months?: number[] | null): MomentRow => ({ id: date, entry_date: date, body: "A walk.", is_moment: true, created_at: `${date}T10:00:00Z`, recall_months });
  it("On this day keeps only the anniversaries the person kept; missing means all (today's behaviour)", () => {
    expect(pickOnThisDay([moment("2025-11-14")], TODAY, null)?.kind).toBe("year");
    expect(pickOnThisDay([moment("2025-11-14", [1, 6])], TODAY, null)).toBeNull();
    expect(pickOnThisDay([moment("2025-11-14", [1, 6]), moment("2026-05-14", [6])], TODAY, null)?.kind).toBe("sixMonths");
    expect(pickOnThisDay([moment("2026-10-14", [])], TODAY, null)).toBeNull();
  });
});
