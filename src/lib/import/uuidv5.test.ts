// @vitest-environment node
import { describe, expect, it } from "vitest";
import { planImport } from "./journalImport";
import { importEntryId, uuidv5 } from "./uuidv5";

describe("uuidv5 (RFC 4122, SHA-1)", () => {
  it("the standard reference vector: DNS namespace, www.example.com", async () => {
    expect(await uuidv5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("import entry ids: the same note always gives the same id; any difference gives another (H1)", async () => {
    const e = { date: "2026-10-19", time: "20:15", body: "A good walk." };
    const id = await importEntryId("u1", e);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await importEntryId("u1", { ...e })).toBe(id);
    expect(await importEntryId("u2", e)).not.toBe(id);
    expect(await importEntryId("u1", { ...e, time: "20:16" })).not.toBe(id);
    expect(await importEntryId("u1", { ...e, body: "A good walk!" })).not.toBe(id);
  });
});

describe("importEntryId: copies (1.1 P)", () => {
  it("the first copy keeps the id it always had; the second gets its own", async () => {
    const e = { date: "2026-10-01", time: null, body: "Same" };
    const first = await importEntryId("u1", e);
    expect(await importEntryId("u1", { ...e, dup: 0 })).toBe(first);
    expect(await importEntryId("u1", { ...e, dup: 1 })).not.toBe(first);
  });
});

describe("importEntryId over a whole file: the same words more than once on a day (UX, 1.1 P)", () => {
  const ids = async (text: string) => {
    const r = planImport(text, "2026-12-31");
    if (r.status !== "ok") throw new Error("plan failed");
    return Promise.all(r.plan.entries.map((e) => importEntryId("u1", e)));
  };
  const TWICE = "date,mood,note\n2026-10-01,4,Same\n2026-10-01,4,Same\n";

  it("re-importing the same file gives the same ids, so nothing is new", async () => {
    const first = await ids(TWICE);
    expect(new Set(first).size).toBe(2);
    expect(await ids(TWICE)).toEqual(first);
  });

  it("a third copy added later is the only new id", async () => {
    const before = await ids(TWICE);
    const after = await ids(`${TWICE}2026-10-01,4,Same\n`);
    expect(after.slice(0, 2)).toEqual(before);
    expect(before).not.toContain(after[2]);
  });
});
