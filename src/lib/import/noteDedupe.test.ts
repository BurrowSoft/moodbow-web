// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ImportEntry } from "./journalImport";
import { dropExistingNotes, noteKey } from "./noteDedupe";

const entry = (date: string, body: string, dup?: number): ImportEntry => ({ date, time: null, body, ...(dup ? { dup } : {}) });
const counts = async (pairs: [string, string, number][]) => new Map(await Promise.all(pairs.map(async ([d, b, n]) => [await noteKey(d, b), n] as [string, number])));

describe("noteKey: a day and the exact text", () => {
  it("the same day and text match, line endings aside; no trim, no case folding", async () => {
    expect(await noteKey("2026-10-01", "a\r\nb")).toBe(await noteKey("2026-10-01", "a\nb"));
    expect(await noteKey("2026-10-01", " a")).not.toBe(await noteKey("2026-10-01", "a"));
    expect(await noteKey("2026-10-01", "A")).not.toBe(await noteKey("2026-10-01", "a"));
    expect(await noteKey("2026-10-02", "a")).not.toBe(await noteKey("2026-10-01", "a"));
  });

  it("a hash: no note text in the key", async () => {
    const key = await noteKey("2026-10-01", "My private words");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("private");
  });
});

describe("dropExistingNotes (UX §P M1): import max(0, copies in the file − copies already there)", () => {
  const FILE = [entry("2026-10-01", "Same"), entry("2026-10-01", "Same", 1), entry("2026-10-02", "Other")];

  it("(a) everything already there: nothing kept", async () => {
    const { keep, dropped } = await dropExistingNotes(FILE, await counts([["2026-10-01", "Same", 2], ["2026-10-02", "Other", 1]]));
    expect(keep).toEqual([]);
    expect(dropped).toHaveLength(3);
  });

  it("(b) a fresh account: every copy kept", async () => {
    expect((await dropExistingNotes(FILE, new Map())).keep).toEqual(FILE);
  });

  it("(c) 1 copy there, 2 in the file: exactly the second (dup 1, so its id is the one a resumed run expects)", async () => {
    const { keep } = await dropExistingNotes(FILE, await counts([["2026-10-01", "Same", 1]]));
    expect(keep).toEqual([entry("2026-10-01", "Same", 1), entry("2026-10-02", "Other")]);
  });

  it("(d) more already there than in the file: nothing of it, never a negative", async () => {
    const { keep } = await dropExistingNotes(FILE, await counts([["2026-10-01", "Same", 5]]));
    expect(keep).toEqual([entry("2026-10-02", "Other")]);
  });

  it("(e) the same text on another day is not a copy", async () => {
    const { keep } = await dropExistingNotes(FILE, await counts([["2026-10-03", "Same", 1], ["2026-10-01", "Other", 1]]));
    expect(keep).toEqual(FILE);
  });
});
