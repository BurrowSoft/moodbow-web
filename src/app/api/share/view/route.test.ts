// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/share/view (1.4 G): the only caller of share_view. The token is checked and hashed here;
// only its sha256 reaches the database; every answer waits for the same floor.
const readSharedWeek = vi.fn();
vi.mock("@/lib/plus/serviceRole", () => ({ readSharedWeek: (...a: unknown[]) => readSharedWeek(...a) }));
let gate = "draft";
let drafts = false;
vi.mock("@/lib/conditions", async (orig) => ({ ...(await orig<typeof import("@/lib/conditions")>()), pageGate: () => gate, draftsAllowed: () => drafts }));
const { POST } = await import("./route");
const { RESPONSE_FLOOR_MS } = await import("@/lib/share/trustedShare");

const post = (body: unknown) => POST(new Request("https://x.invalid/api/share/view", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const raw = randomBytes(32);
const token = raw.toString("base64url");
const okWeek = { status: "ok", first_name: null, week_start: "2026-11-16", days: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${16 + i}`, mood: null })), check_ins: 0 };

beforeEach(() => {
  readSharedWeek.mockReset();
  gate = "draft";
  drafts = false;
});

describe("/api/share/view", () => {
  it("sends only the token's sha256 and the week; answers the checked week with no-store, no-referrer, noindex", async () => {
    readSharedWeek.mockResolvedValue({ ok: true, value: okWeek, host: "staging.supabase.co" });
    const res = await post({ token, week: 2 });
    expect(readSharedWeek).toHaveBeenCalledWith(`\\x${createHash("sha256").update(raw).digest("hex")}`, 2);
    expect(JSON.stringify(readSharedWeek.mock.calls)).not.toContain(token);
    expect(await res.json()).toEqual(okWeek);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("a week outside 0-3 is asked for as 0", async () => {
    readSharedWeek.mockResolvedValue({ ok: true, value: okWeek, host: "staging.supabase.co" });
    await post({ token, week: 9 });
    expect(readSharedWeek.mock.calls[0][1]).toBe(0);
  });

  it("no token, a bad one, a huge body, junk: unavailable, the database never asked", async () => {
    for (const body of [{}, { token: "short" }, { token: `${token}x` }, "not json", JSON.stringify({ token, pad: "x".repeat(400) })]) {
      const res = await post(body);
      expect(await res.json()).toEqual({ status: "unavailable" });
    }
    expect(readSharedWeek).not.toHaveBeenCalled();
  });

  it("a failed read or an off-shape answer: the same unavailable", async () => {
    readSharedWeek.mockResolvedValueOnce({ ok: false, reason: "no-key", host: "none" });
    expect(await (await post({ token, week: 0 })).json()).toEqual({ status: "unavailable" });
    readSharedWeek.mockResolvedValueOnce({ ok: true, value: { status: "ok", days: [] }, host: "staging.supabase.co" });
    expect(await (await post({ token, week: 0 })).json()).toEqual({ status: "unavailable" });
    readSharedWeek.mockRejectedValueOnce(new Error("boom"));
    expect(await (await post({ token, week: 0 })).json()).toEqual({ status: "unavailable" });
  });

  it("every answer waits for the floor, a miss as long as a hit", async () => {
    readSharedWeek.mockResolvedValue({ ok: true, value: okWeek, host: "staging.supabase.co" });
    for (const body of [{ token: "short" }, { token, week: 0 }]) {
      const at = Date.now();
      await post(body);
      expect(Date.now() - at).toBeGreaterThanOrEqual(RESPONSE_FLOOR_MS - 5);
    }
  });

  // The Web Tester's #363 row: a Preview says which step answered. Non-secret, test builds only.
  it("on a test build: the reason and the database host; never the token or hash", async () => {
    drafts = true;
    const cases: [unknown, unknown, string][] = [
      [{ token: "short" }, undefined, "bad-token"],
      [{ token, week: 0 }, { ok: false, reason: "no-key", host: "none" }, "no-key"],
      [{ token, week: 0 }, { ok: false, reason: "rpc:PGRST202", host: "x.supabase.co" }, "rpc:PGRST202"],
      [{ token, week: 0 }, { ok: true, value: { status: "unavailable" }, host: "x.supabase.co" }, "db-unavailable"],
      [{ token, week: 0 }, { ok: true, value: { status: "ok", days: [] }, host: "x.supabase.co" }, "parse"],
      [{ token, week: 0 }, { ok: true, value: okWeek, host: "x.supabase.co" }, "ok"],
    ];
    for (const [body, read, reason] of cases) {
      if (read) readSharedWeek.mockResolvedValueOnce(read);
      const res = await post(body);
      expect(res.headers.get("x-share-reason"), reason).toBe(reason);
      const all = JSON.stringify([...res.headers.entries()]);
      expect(all).not.toContain(token);
    }
  });

  it("on Production: no reason headers at all", async () => {
    drafts = false;
    readSharedWeek.mockResolvedValue({ ok: false, reason: "no-key", host: "none" });
    const res = await post({ token, week: 0 });
    expect(res.headers.get("x-share-reason")).toBeNull();
    expect(res.headers.get("x-share-db-host")).toBeNull();
  });

  it("hidden (trusted-share-live off on Production): a 404, nothing read", async () => {
    gate = "hidden";
    const res = await post({ token, week: 0 });
    expect(res.status).toBe(404);
    expect(readSharedWeek).not.toHaveBeenCalled();
  });
});
