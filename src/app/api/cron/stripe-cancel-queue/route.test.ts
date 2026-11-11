// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cancel = vi.fn(async () => ({}));
const retrieveSub = vi.fn();
vi.mock("@/lib/plus/stripe", () => ({
  getStripe: () => ({ subscriptions: { cancel } }),
  stripeConfigured: () => true,
  retrieveSubscriptionOrNull: (...a: unknown[]) => retrieveSub(...a),
}));
let queue: string[] = [];
const clear = vi.fn(async () => true);
vi.mock("@/lib/plus/serviceRole", () => ({
  serviceRoleConfigured: () => true,
  readCancelQueue: async () => ({ ok: true, value: queue }),
  clearCancelQueue: (...a: unknown[]) => clear(...(a as [])),
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));
const { GET } = await import("./route");

const get = (auth: string | null = "Bearer cron-test") => GET(new Request("https://www.moodbow.com/api/cron/stripe-cancel-queue", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => vi.stubEnv("CRON_SECRET", "cron-test"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/cron/stripe-cancel-queue: accounts deleted in the app", () => {
  it("cancels what's still running, clears what's done; a failure stays for tomorrow", async () => {
    queue = ["sub_live", "sub_gone", "sub_unknown", "sub_err"];
    retrieveSub.mockImplementation(async (id: string) => {
      if (id === "sub_err") throw new Error("down");
      return id === "sub_live" ? { id, status: "active" } : id === "sub_gone" ? { id, status: "canceled" } : null;
    });
    expect(await (await get()).json()).toEqual({ cancelled: 3, failed: 1 });
    expect(cancel.mock.calls).toEqual([["sub_live"]]);
    expect(clear.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["sub_live", "sub_gone", "sub_unknown"]);
  });

  it("only Vercel Cron's secret; none set refuses every call", async () => {
    expect((await get(null)).status).toBe(401);
    expect((await get("Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await get("Bearer ")).status).toBe(401);
    expect(cancel).not.toHaveBeenCalled();
  });
});
