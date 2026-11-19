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
const { captureMessage } = await import("@sentry/nextjs");
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

describe("GET /api/cron/stripe-reconcile with Plus on: Moodbow's subscriptions only (the account is shared with SolvyMed)", () => {
  const LONG_AGO = 1_700_000_000; // past the webhook's grace hour
  const sub = (id: string, metadata: Record<string, string>, price: string) => ({ id, status: "active", created: LONG_AGO, metadata, items: { data: [{ price: { id: price } }] } });
  const listing = (...subs: object[]) =>
    (async function* () {
      yield* subs;
    })();

  beforeEach(() => {
    gate = "live";
    vi.stubEnv("CRON_SECRET", "cron-test");
    vi.stubEnv("STRIPE_PLUS_PRICE_ID", "price_ours");
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => vi.mocked(console.log).mockRestore());

  it("SolvyMed's are counted, never compared, never named; ours still are", async () => {
    list.mockReturnValue(
      listing(
        sub("sub_ours", { app: "moodbow", user_id: "u1" }, "price_ours"),
        sub("sub_solvymed", { user_id: "their_user_1" }, "price_theirs"),
        sub("sub_tagged_elsewhere", { app: "solvymed", user_id: "their_user_2" }, "price_ours"),
      ),
    );
    readStripeEntitlements.mockResolvedValue({ ok: true, value: [] });
    const body = await (await get("Bearer cron-test")).json();
    expect(body.counts).toEqual({ stripe: 1, foreign: 2, rows: 0 });
    expect(body.mismatches).toEqual([expect.objectContaining({ kind: "paying_without_plus", userId: "u1", subscriptionId: "sub_ours" })]);
    const calls = vi.mocked(captureMessage).mock.calls;
    expect(calls[0][1]).toMatchObject({ extra: { counts: { stripe: 1, foreign: 2, rows: 0 } } });
    const everything = JSON.stringify([body, calls, vi.mocked(console.log).mock.calls]);
    for (const theirs of ["sub_solvymed", "sub_tagged_elsewhere", "their_user", "price_theirs"]) expect(everything).not.toContain(theirs);
  });

  it("no price of ours set: 503 before Stripe is listed", async () => {
    vi.stubEnv("STRIPE_PLUS_PRICE_ID", "");
    const res = await get("Bearer cron-test");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });
    expect(list).not.toHaveBeenCalled();
  });
});
