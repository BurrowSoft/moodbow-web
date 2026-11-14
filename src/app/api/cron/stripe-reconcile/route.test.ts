// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The daily Stripe ↔ entitlements check: without Vercel Cron's secret it answers 401 before
// it reads anything (1.3.0 ships these crons to Production, possibly before CRON_SECRET is set).
const list = vi.fn();
const getStripe = vi.fn(() => ({ subscriptions: { list } }));
const stripeConfigured = vi.fn(() => true);
vi.mock("@/lib/plus/stripe", () => ({ getStripe: () => getStripe(), stripeConfigured: () => stripeConfigured() }));
const readStripeEntitlements = vi.fn();
const serviceRoleConfigured = vi.fn(() => true);
vi.mock("@/lib/plus/serviceRole", () => ({ readStripeEntitlements: () => readStripeEntitlements(), serviceRoleConfigured: () => serviceRoleConfigured() }));
let gate: "hidden" | "draft" | "live" = "hidden";
const pageGate = vi.fn(() => gate);
vi.mock("@/lib/conditions", () => ({ pageGate: () => pageGate() }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));
const { GET } = await import("./route");

const get = (auth: string | null) => GET(new Request("https://www.moodbow.com/api/cron/stripe-reconcile", { headers: auth ? { authorization: auth } : {} }));
const nothingRead = () => {
  expect(pageGate).not.toHaveBeenCalled();
  expect(stripeConfigured).not.toHaveBeenCalled();
  expect(getStripe).not.toHaveBeenCalled();
  expect(list).not.toHaveBeenCalled();
  expect(readStripeEntitlements).not.toHaveBeenCalled();
};

beforeEach(() => {
  gate = "hidden";
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/cron/stripe-reconcile: only Vercel Cron's secret", () => {
  it("no CRON_SECRET set: every call is a 401, before any read", async () => {
    vi.stubEnv("CRON_SECRET", "");
    for (const auth of [null, "Bearer ", "Bearer undefined"]) {
      const res = await get(auth);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
    nothingRead();
  });

  it("a wrong or missing header with the secret set: 401, before any read", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test");
    expect((await get(null)).status).toBe(401);
    expect((await get("Bearer wrong")).status).toBe(401);
    nothingRead();
  });

  it("the right secret with Plus off: skipped, without touching Stripe or the database", async () => {
    vi.stubEnv("CRON_SECRET", "cron-test");
    expect(await (await get("Bearer cron-test")).json()).toEqual({ skipped: "plus_off" });
    expect(getStripe).not.toHaveBeenCalled();
    expect(readStripeEntitlements).not.toHaveBeenCalled();
  });
});
