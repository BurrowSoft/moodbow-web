// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Removing a picture (UX and the Reviewer, 14 Nov): its files first, under the person's own session
// while the row is live, checked gone; then the row. "Deleted" only when both happened.
const calls: string[] = [];
let row: { path: string; thumb_path: string } | null = { path: "u/e/p.jpg", thumb_path: "u/e/p_t.jpg" };
let removeError: unknown = null;
let stillSigned = false;
let checkFails = false;
let rpcError: unknown = null;
const client = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => (calls.push("read"), { data: row, error: null }) }) }) }),
  storage: {
    from: () => ({
      remove: async (paths: string[]) => (calls.push(`remove ${paths.join(",")}`), { data: [], error: removeError }),
      createSignedUrls: async (paths: string[]) => (calls.push("check"), checkFails ? { data: null, error: { message: "503" } } : { data: paths.map((p) => ({ path: p, signedUrl: stillSigned ? "https://x" : null })), error: null }),
    }),
  },
  rpc: async (name: string) => (calls.push(name), { error: rpcError }),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
const { deletePicture } = await import("./pictureActions");
const ID = "a0350000-0000-4000-8000-0000000000p1".replace("p1", "01");

beforeEach(() => {
  calls.length = 0;
  row = { path: "u/e/p.jpg", thumb_path: "u/e/p_t.jpg" };
  removeError = null;
  stillSigned = false;
  checkFails = false;
  rpcError = null;
});

describe("deletePicture: files first (own session, row live), checked gone, then the row", () => {
  it("in that order; ok", async () => {
    expect(await deletePicture(ID)).toEqual({ status: "ok" });
    expect(calls).toEqual(["read", "remove u/e/p.jpg,u/e/p_t.jpg", "check", "picture_delete"]);
  });
  it("a remove that fails, or a file still signable afterwards: nothing else happens; error", async () => {
    removeError = { message: "down" };
    expect(await deletePicture(ID)).toEqual({ status: "error" });
    expect(calls).not.toContain("picture_delete");
    calls.length = 0;
    removeError = null;
    stillSigned = true;
    expect(await deletePicture(ID)).toEqual({ status: "error" });
    expect(calls).not.toContain("picture_delete");
    // The check failing as a whole request (network, 5xx) verified nothing: not gone (the Reviewer).
    calls.length = 0;
    stillSigned = false;
    checkFails = true;
    expect(await deletePicture(ID)).toEqual({ status: "error" });
    expect(calls).not.toContain("picture_delete");
  });
  it("not theirs (no row): nothing removed; the row delete failing after the files went: error", async () => {
    row = null;
    expect(await deletePicture(ID)).toEqual({ status: "error" });
    expect(calls).toEqual(["read"]);
    row = { path: "u/e/p.jpg", thumb_path: "u/e/p_t.jpg" };
    calls.length = 0;
    rpcError = { message: "x" };
    expect(await deletePicture(ID)).toEqual({ status: "error" });
    expect(calls.at(-1)).toBe("picture_delete");
  });
});
