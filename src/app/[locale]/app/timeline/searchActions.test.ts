// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Search (1.1 L): the search_entries rpc (a POST body, never a URL: decision
// 196) with the raw text — the function escapes % and _ itself (UX), which
// the e2e checks ("50%" finds only a literal 50%). At most 50, and only a
// snippet comes back.
type Row = { id: string; entry_date: string; body: string; is_moment: boolean; created_at: string };
let rows: Row[] = [];
let readError: unknown = null;
let live = true;
// Coverage pass: no client, a null answer, and the day-mood read.
let noClient = false;
let nullRows = false;
let checkIns: { local_date: string; mood: number }[] | null = [{ local_date: "2026-10-20", mood: 4 }];
const rpc = vi.fn();
const moodsAsked = vi.fn();
const client = {
  rpc: async (...a: unknown[]) => {
    rpc(...a);
    return readError ? { data: null, error: readError } : { data: nullRows ? null : rows, error: null };
  },
  from: () => ({
    select: () => ({
      in: async (...a: unknown[]) => {
        moodsAsked(...a);
        return { data: checkIns, error: null };
      },
    }),
  }),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => (noClient ? null : client) }));
vi.mock("@/lib/conditions", () => ({ pageGate: () => (live ? "live" : "hidden") }));
const { searchEntries } = await import("./searchActions");

const row = (n: number, body = "A long walk by the river."): Row => ({
  id: `id-${n}`,
  entry_date: n === 0 ? "2026-10-20" : "2026-09-01",
  body,
  is_moment: n === 0,
  created_at: "2026-10-20T09:00:00Z",
});

beforeEach(() => {
  rows = [];
  readError = null;
  live = true;
  noClient = false;
  nullRows = false;
  checkIns = [{ local_date: "2026-10-20", mood: 4 }];
  rpc.mockReset();
  moodsAsked.mockReset();
});

describe("searchEntries", () => {
  it("search_entries with the trimmed raw text (no client escaping) and 51", async () => {
    await searchEntries("  50%_off ");
    expect(rpc).toHaveBeenCalledWith("search_entries", { p_q: "50%_off", p_limit: 51 });
  });

  it("hits: id, date, moment, the day's mood and a snippet (never the whole body)", async () => {
    rows = [row(0), row(1)];
    const r = await searchEntries("river");
    expect(r).toEqual({
      status: "ok",
      more: false,
      hits: [
        { id: "id-0", date: "2026-10-20", isMoment: true, mood: 4, snippet: { before: "A long walk by the ", match: "river", after: "." } },
        { id: "id-1", date: "2026-09-01", isMoment: false, mood: null, snippet: { before: "A long walk by the ", match: "river", after: "." } },
      ],
    });
    expect(JSON.stringify(r)).not.toContain("body");
  });

  it("51 rows: 50 shown and more", async () => {
    rows = Array.from({ length: 51 }, (_, i) => row(i + 1));
    const r = await searchEntries("walk");
    expect(r.status === "ok" && r.hits.length).toBe(50);
    expect(r.status === "ok" && r.more).toBe(true);
  });

  it("too short, not live, or a failed call: error, and nothing is asked", async () => {
    expect(await searchEntries("a")).toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
    live = false;
    expect(await searchEntries("walk")).toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
    live = true;
    readError = { message: "boom" };
    expect(await searchEntries("walk")).toEqual({ status: "error" });
  });
});

// Coverage pass (UX): the empty and odd answers.
describe("searchEntries: empty and odd answers", () => {
  it("no Supabase client: error, nothing asked", async () => {
    noClient = true;
    expect(await searchEntries("walk")).toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("no hits (an empty list, or no data at all): ok and empty, and the day moods aren't asked", async () => {
    expect(await searchEntries("walk")).toEqual({ status: "ok", hits: [], more: false });
    nullRows = true;
    expect(await searchEntries("walk")).toEqual({ status: "ok", hits: [], more: false });
    expect(moodsAsked).not.toHaveBeenCalled();
  });

  it("the day moods asked once per day shown; none answered → no mood, the hits still come", async () => {
    rows = [row(0), { ...row(2), entry_date: "2026-10-20" }, row(1)];
    checkIns = null;
    const r = await searchEntries("river");
    expect(moodsAsked).toHaveBeenCalledTimes(1);
    expect(moodsAsked).toHaveBeenCalledWith("local_date", ["2026-10-20", "2026-09-01"]);
    expect(r.status === "ok" && r.hits.map((h) => h.mood)).toEqual([null, null, null]);
  });

  it("a hit the snippet can't place (the database folded case differently): the entry's opening, whitespace flattened, at most 80", async () => {
    rows = [row(0, `Walked down the\n\nSTRASSE   today. ${"x".repeat(100)}`)];
    const r = await searchEntries("straße");
    expect(r.status === "ok" && r.hits[0].snippet).toEqual({ before: "", match: "", after: `Walked down the STRASSE today. ${"x".repeat(49)}` });
  });
});
