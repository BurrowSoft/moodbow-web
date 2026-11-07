import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./SecurityNotice", () => ({ SecurityNotice: () => null }));
const { SECURITY_READ_WAIT_MS, SecurityNoticeRead } = await import("./SecurityNoticeRead");
const { SecurityNotice } = await import("./SecurityNotice");

const client = (answer: () => Promise<unknown>) => ({ rpc: vi.fn(answer) }) as never;
afterEach(() => vi.useRealTimers());

describe("SecurityNoticeRead", () => {
  it("an update out: its card, for this person and update", async () => {
    const out = await SecurityNoticeRead({ supabase: client(async () => ({ data: "2026-12-01-a", error: null })), uid: "u1" });
    expect(out).toMatchObject({ type: SecurityNotice, props: { id: "2026-12-01-a", uid: "u1" } });
  });
  it.each([
    ["none out", async () => ({ data: null, error: null })],
    ["an empty id", async () => ({ data: "", error: null })],
    ["the read failed", async () => ({ data: null, error: { message: "boom" } })],
    ["the read threw", async () => Promise.reject(new Error("boom"))],
  ])("%s: nothing", async (_name, answer) => {
    expect(await SecurityNoticeRead({ supabase: client(answer), uid: "u1" })).toBeNull();
  });
  it("a read that never answers: nothing, once the short wait is up", async () => {
    vi.useFakeTimers();
    const out = SecurityNoticeRead({ supabase: client(() => new Promise(() => {})), uid: "u1" });
    await vi.advanceTimersByTimeAsync(SECURITY_READ_WAIT_MS);
    await expect(out).resolves.toBeNull();
    expect(SECURITY_READ_WAIT_MS).toBeLessThanOrEqual(3000);
  });
});
