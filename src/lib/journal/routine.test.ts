// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeRoutineName, parseRoutineItems, parseRoutineTicks, ROUTINE_ITEM_COLUMNS, routineNameLength, routineNameProblem, tickableOn, ticksByItem, ticksForDay } from "./routine";

const A = "0b6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const B = "1c7f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const C = "2d8f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const item = (id: string, position: number, over: Record<string, unknown> = {}) => ({ id, name: `Item ${position}`, position, in_appointment: false, started_on: "2026-11-01", ...over });

describe("routine (1.4 F, migration 038's rules)", () => {
  it("names: trimmed, inner whitespace collapsed, counted in code points", () => {
    expect(normalizeRoutineName("  Morning \n  meds ")).toBe("Morning meds");
    expect(routineNameLength("💊 meds")).toBe(6);
  });

  it("name problems: empty, over 40, the 4th, a same name in another case", () => {
    expect(routineNameProblem("   ", [], true)).toBe("empty");
    expect(routineNameProblem("x".repeat(40), [], true)).toBeNull();
    expect(routineNameProblem("x".repeat(41), [], true)).toBe("tooLong");
    expect(routineNameProblem("Walk", ["a", "b", "c"], true)).toBe("full");
    expect(routineNameProblem("Walk", ["a", "b", "c"], false)).toBeNull();
    expect(routineNameProblem(" WALK  outside", ["walk outside"], true)).toBe("duplicate");
  });

  it("never reads user_id or created_at", () => {
    expect(ROUTINE_ITEM_COLUMNS).not.toMatch(/user_id|created_at/);
  });

  it("parses rows in position order; malformed rows go", () => {
    const rows = [item(B, 1), item(A, 0), { ...item(C, 2), started_on: "soon" }, { id: 5 }, null];
    expect(parseRoutineItems(rows).map((i) => i.id)).toEqual([A, B]);
    expect(parseRoutineItems(null)).toEqual([]);
  });

  it("a day's ticks: only listed items, in the items' order", () => {
    const items = parseRoutineItems([item(A, 0), item(B, 1)]);
    expect(ticksForDay([{ item_id: B }, { item_id: "gone" }, { item_id: A }], items)).toEqual([A, B]);
    expect(ticksForDay("junk", items)).toEqual([]);
  });

  it("ticks per item, days ascending", () => {
    const m = ticksByItem([
      { item_id: A, local_date: "2026-11-03" },
      { item_id: A, local_date: "2026-11-02" },
      { item_id: B, local_date: "bad" },
    ]);
    expect(m.get(A)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(m.has(B)).toBe(false);
  });

  it("only items started on or before the day can be ticked", () => {
    const items = parseRoutineItems([item(A, 0, { started_on: "2026-11-10" }), item(B, 1, { started_on: "2026-11-01" })]);
    expect(tickableOn(items, "2026-11-05").map((i) => i.id)).toEqual([B]);
    expect(tickableOn(items, "2026-11-10").map((i) => i.id)).toEqual([A, B]);
  });

  it("the form's ticks: ids only, duplicates once, junk refused", () => {
    expect(parseRoutineTicks(null)).toEqual([]);
    expect(parseRoutineTicks("")).toEqual([]);
    expect(parseRoutineTicks(JSON.stringify([A, A, B]))).toEqual([A, B]);
    expect(parseRoutineTicks("{")).toBeNull();
    expect(parseRoutineTicks(JSON.stringify(["Morning meds"]))).toBeNull();
    expect(parseRoutineTicks(JSON.stringify({ a: A }))).toBeNull();
    expect(parseRoutineTicks(JSON.stringify(Array(7).fill(A)))).toBeNull();
  });
});
