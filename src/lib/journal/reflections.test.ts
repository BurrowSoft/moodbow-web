import { beforeEach, describe, expect, it } from "vitest";
import getHelpLabel from "../../../content/contracts/get-help-label.json";
import { readReflections, reflectionLine, REFLECTIONS_MAX, REFLECTIONS_PAGE, shownOf } from "./reflections";

// The Web Tester's seeded crisis row for the AI window (25 Nov): it names the help button, so its row is
// the date and the neutral word only, and its text is nowhere in what the list gets.
const SEEDED = 'SEEDED-CRISIS-MARKER-7Q. Please tap "Want to talk to someone?" now.';

describe("reflectionLine: the first line, or null for a crisis reply (decision 258)", () => {
  it("the first line with text, trimmed", () => {
    expect(reflectionLine("  Taking the long way home sounds lovely.\nWhat made it feel right?")).toBe("Taking the long way home sounds lovely.");
    expect(reflectionLine("\n\n  Coffee with Mai.  \r\nMore.")).toBe("Coffee with Mai.");
  });
  it("a crisis reply (it names the help button, in any language of the contract) is null, as is one with no text", () => {
    expect(reflectionLine(SEEDED)).toBeNull();
    for (const [lang, label] of Object.entries(getHelpLabel.labels)) expect(reflectionLine(`Thank you for telling me.\n${label}`), lang).toBeNull();
    // The panel's tolerance: case, a missing ?, a no-break space, a curly apostrophe.
    expect(reflectionLine("If it helps: WANT TO TALK TO SOMEONE")).toBeNull();
    expect(reflectionLine("Want to talk to someone?")).toBeNull();
    expect(reflectionLine("Envie de parler à quelqu’un ?")).toBeNull();
    expect(reflectionLine("   \n ")).toBeNull();
    // Only the label: the word "talk" alone isn't a crisis reply.
    expect(reflectionLine("You wanted to talk about work.")).toBe("You wanted to talk about work.");
  });
});

describe("shownOf: See all's ?shown=, a whole number of pages", () => {
  it("at least one page, at most the cap, rounded up to a page", () => {
    expect(shownOf(undefined)).toBe(REFLECTIONS_PAGE);
    expect(shownOf("40")).toBe(40);
    expect(shownOf("41")).toBe(60);
    expect(shownOf("0")).toBe(REFLECTIONS_PAGE);
    expect(shownOf("-20")).toBe(REFLECTIONS_PAGE);
    expect(shownOf(["40"])).toBe(REFLECTIONS_PAGE);
    expect(shownOf("9999")).toBe(REFLECTIONS_MAX);
    expect(shownOf("99999")).toBe(REFLECTIONS_PAGE);
  });
});

type Result = { data: unknown; error: unknown };
const calls: { table: string; steps: [string, unknown[]][] }[] = [];
const client = (reflections: Result, entries: (ids: string[]) => Result) =>
  ({
    from(table: string) {
      const steps: [string, unknown[]][] = [];
      calls.push({ table, steps });
      const c: Record<string, unknown> = {};
      for (const s of ["select", "order", "limit", "in"]) c[s] = (...a: unknown[]) => (steps.push([s, a]), c);
      c.then = (done: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
        Promise.resolve(table === "ai_reflections" ? reflections : entries((steps.find(([s]) => s === "in")?.[1][1] as string[]) ?? [])).then(done, fail);
      return c;
    },
  }) as never;
const row = (i: number, body = `Line ${i}.\nMore.`, entry = `e${i}`) => ({ id: `r${i}`, entry_id: entry, body, created_at: `2026-11-${String(30 - (i % 28)).padStart(2, "0")}T10:00:00Z` });
const dated = (ids: string[]) => ({ data: ids.map((id) => ({ id, entry_date: `2026-11-${id.slice(1).padStart(2, "0").slice(-2)}` })), error: null });

beforeEach(() => {
  calls.length = 0;
});

describe("readReflections (RLS: the person's own)", () => {
  it("newest first (the reflection's time, then id), one more than asked to know if there are more", async () => {
    const read = await readReflections(client({ data: [row(1), row(2), row(3), row(4)], error: null }, dated), 3);
    expect(calls[0].table).toBe("ai_reflections");
    expect(calls[0].steps).toEqual([
      ["select", ["id, entry_id, body, created_at"]],
      ["order", ["created_at", { ascending: false }]],
      ["order", ["id", { ascending: false }]],
      ["limit", [4]],
    ]);
    expect(read).toEqual({
      rows: [
        { id: "r1", entryId: "e1", entryDate: "2026-11-01", line: "Line 1." },
        { id: "r2", entryId: "e2", entryDate: "2026-11-02", line: "Line 2." },
        { id: "r3", entryId: "e3", entryDate: "2026-11-03", line: "Line 3." },
      ],
      more: true,
    });
    // Only the shown rows' entries are read, for their dates.
    expect(calls[1]).toEqual({ table: "entries", steps: [["select", ["id, entry_date"]], ["in", ["id", ["e1", "e2", "e3"]]]] });
  });

  it("no more than asked: more is false; none at all: no entries read", async () => {
    expect((await readReflections(client({ data: [row(1)], error: null }, dated), 3))!.more).toBe(false);
    calls.length = 0;
    expect(await readReflections(client({ data: [], error: null }, dated), 3)).toEqual({ rows: [], more: false });
    expect(calls.map((c) => c.table)).toEqual(["ai_reflections"]);
  });

  it("a crisis reply's row has no line, and its text is nowhere in what the list gets (the Reviewer)", async () => {
    const read = await readReflections(client({ data: [row(1), row(2, SEEDED)], error: null }, dated), 3);
    expect(read!.rows[1]).toEqual({ id: "r2", entryId: "e2", entryDate: "2026-11-02", line: null });
    expect(JSON.stringify(read)).not.toContain("SEEDED-CRISIS-MARKER-7Q");
    expect(JSON.stringify(read)).not.toContain("talk to someone");
  });

  it("a reflection whose entry is gone isn't listed (it would open nothing)", async () => {
    const read = await readReflections(client({ data: [row(1), row(2)], error: null }, (ids) => dated(ids.filter((id) => id !== "e1"))), 3);
    expect(read!.rows.map((r) => r.id)).toEqual(["r2"]);
  });

  it("many entries are read in groups of 100 (each id is in the read's address)", async () => {
    const many = Array.from({ length: 250 }, (_, i) => row(i, `Line ${i}.`, `e${i}`));
    const read = await readReflections(client({ data: many, error: null }, dated), 250);
    expect(calls.filter((c) => c.table === "entries").map((c) => (c.steps[1][1][1] as string[]).length)).toEqual([100, 100, 50]);
    expect(read!.rows).toHaveLength(250);
  });

  it("a failed read is null, never a shorter list passed off as all of it", async () => {
    expect(await readReflections(client({ data: null, error: { message: "boom" } }, dated), 3)).toBeNull();
    expect(await readReflections(client({ data: [row(1)], error: null }, () => ({ data: null, error: { message: "boom" } })), 3)).toBeNull();
  });
});
