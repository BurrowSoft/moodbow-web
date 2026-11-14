// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Search by tag (tags-live; UX, 11 Nov): search_tags, the text in a POST body
// (decision 196), grouped by day, newest first, beside the entry hits.
let tagRows: unknown = [];
let tagsError: unknown = null;
let live = "live";
const rpc = vi.fn(async (name: string) => (name === "search_tags" ? { data: tagsError ? null : tagRows, error: tagsError } : { data: [], error: null }));
const client = { rpc, from: () => ({ select: () => ({ in: async () => ({ data: [{ local_date: "2026-10-20", mood: 2 }], error: null }) }) }) };
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/lib/conditions", () => ({ pageGate: (id: string) => (id === "tags-live" ? live : "live") }));
const { searchEntries } = await import("./searchActions");

beforeEach(() => {
  tagRows = [];
  tagsError = null;
  live = "live";
  rpc.mockClear();
});

describe("searchEntries: days whose tags match", () => {
  it("search_tags with the text in the body; the rows by day, newest first, with the day's mood", async () => {
    tagRows = [
      { local_date: "2026-10-20", tag: "Walk" },
      { local_date: "2026-10-20", tag: "walk home" },
      { local_date: "2026-09-02", tag: "Walk" },
    ];
    const r = await searchEntries(" walk ");
    expect(rpc).toHaveBeenCalledWith("search_tags", { p_q: "walk", p_limit: 250 });
    expect(r).toMatchObject({
      status: "ok",
      tagDays: [
        { date: "2026-10-20", mood: 2, tags: ["Walk", "walk home"] },
        { date: "2026-09-02", mood: null, tags: ["Walk"] },
      ],
    });
  });
  it("no match, a failed call or malformed rows: no tag days, the entries still answer", async () => {
    expect(await searchEntries("walk")).toEqual({ status: "ok", hits: [], more: false });
    tagsError = { message: "function search_tags does not exist" };
    expect(await searchEntries("walk")).toEqual({ status: "ok", hits: [], more: false });
    tagsError = null;
    tagRows = [{ id: "x" }, null];
    expect(await searchEntries("walk")).toEqual({ status: "ok", hits: [], more: false });
  });
  it("tags off here: search_tags is never called", async () => {
    live = "hidden";
    await searchEntries("walk");
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain("search_tags");
  });
});
