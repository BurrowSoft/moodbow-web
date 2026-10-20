// @vitest-environment node
import { describe, expect, it } from "vitest";
import { IMPORT_NAMESPACE, importEntryId, uuidv5 } from "./uuidv5";

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

// Coverage pass (UX): the default namespace and a note without a time.
describe("the import namespace and untimed notes", () => {
  it("without a namespace, the import namespace is used", async () => {
    expect(await uuidv5("x")).toBe(await uuidv5("x", IMPORT_NAMESPACE));
    expect(await uuidv5("x")).not.toBe(await uuidv5("x", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"));
  });

  it("a note without a time (a generic CSV) has its own stable id, not the same as one at midnight", async () => {
    const untimed = { date: "2026-10-19", time: null, body: "A good walk." };
    const id = await importEntryId("u1", untimed);
    expect(await importEntryId("u1", { ...untimed })).toBe(id);
    expect(await importEntryId("u1", { ...untimed, time: "00:00" })).not.toBe(id);
  });
});
