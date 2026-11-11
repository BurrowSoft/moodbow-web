// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let gate = "draft";
vi.mock("@/lib/conditions", () => ({ pageGate: () => gate }));
const constructEvent = vi.fn();
let configured = true;
vi.mock("@/lib/plus/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: (...a: unknown[]) => constructEvent(...a) } }),
  retrieveSubscriptionOrNull: vi.fn(),
  stripeConfigured: () => configured,
}));
let serviceRole = true;
vi.mock("@/lib/plus/serviceRole", () => ({
  serviceRoleConfigured: () => serviceRole,
  readEntitlement: vi.fn(),
  insertEntitlement: vi.fn(),
  updateEntitlement: vi.fn(),
}));
const sync = vi.fn();
vi.mock("@/lib/plus/stripeSync", async (actual) => ({ ...(await actual<typeof import("@/lib/plus/stripeSync")>()), syncSubscription: (...a: unknown[]) => sync(...a) }));
const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }));
const { POST } = await import("./route");

const post = (sig: string | null = "t=1,v1=x", body = "{}") =>
  POST(new Request("https://www.moodbow.com/api/webhooks/stripe", { method: "POST", body, headers: sig ? { "stripe-signature": sig } : {} }));
const event = (type: string, object: object) => ({ id: "evt_1", type, data: { object } });

beforeEach(() => {
  gate = "draft";
  configured = true;
  serviceRole = true;
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_not_real");
  sync.mockResolvedValue({ kind: "written" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/webhooks/stripe", () => {
  it("a signed subscription event: synced from Stripe's live state by its id", async () => {
    constructEvent.mockReturnValue(event("customer.subscription.updated", { id: "sub_1", status: "active" }));
    const res = await post("t=1,v1=good", '{"raw":true}');
    expect(res.status).toBe(200);
    expect(constructEvent).toHaveBeenCalledWith('{"raw":true}', "t=1,v1=good", "whsec_test_not_real");
    expect(sync.mock.calls[0][0]).toBe("sub_1");
  });

  it("no signature, or a bad one: refused, nothing synced; a bad one is reported", async () => {
    expect((await post(null)).status).toBe(400);
    constructEvent.mockImplementation(() => {
      throw new Error("bad");
    });
    expect((await post()).status).toBe(400);
    expect(sync).not.toHaveBeenCalled();
    expect(captureMessage.mock.calls[0][0]).toBe("Stripe webhook: bad_signature");
  });

  it("an event about no subscription: 200, nothing to do", async () => {
    constructEvent.mockReturnValue(event("customer.created", { id: "cus_1" }));
    expect((await post()).status).toBe(200);
    expect(sync).not.toHaveBeenCalled();
  });

  it("a sync that must be retried: 500 (Stripe retries), reported with the event's type and id only", async () => {
    constructEvent.mockReturnValue(event("invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_1" } }, customer_email: "a@b.c" }));
    sync.mockResolvedValue({ kind: "retry", reason: "db" });
    expect((await post()).status).toBe(500);
    const [message, opts] = captureMessage.mock.calls[0];
    expect(message).toBe("Stripe webhook: sync_db");
    expect(opts.tags).toEqual({ stripe_webhook_failure: "sync_db", stripe_event_type: "invoice.payment_failed", stripe_event_id: "evt_1" });
    expect(JSON.stringify(captureMessage.mock.calls)).not.toContain("a@b.c");
  });

  it("another store's Plus still grants: 200 (retrying can't change it), reported", async () => {
    constructEvent.mockReturnValue(event("customer.subscription.deleted", { id: "sub_1" }));
    sync.mockResolvedValue({ kind: "skipped", reason: "other_store_grants" });
    expect((await post()).status).toBe(200);
    expect(captureMessage.mock.calls[0][0]).toBe("Stripe webhook: other_store_grants");
  });

  it("not set up (no secret, no Stripe key, no service role): 503, never a guess", async () => {
    for (const setup of [() => vi.stubEnv("STRIPE_WEBHOOK_SECRET", ""), () => (configured = false), () => (serviceRole = false)]) {
      vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_not_real");
      configured = true;
      serviceRole = true;
      setup();
      expect((await post()).status).toBe(503);
    }
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("Plus off on Production: 404", async () => {
    gate = "hidden";
    expect((await post()).status).toBe(404);
    expect(constructEvent).not.toHaveBeenCalled();
  });
});
