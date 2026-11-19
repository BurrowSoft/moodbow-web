// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let gate = "draft";
vi.mock("@/lib/conditions", async (actual) => ({ ...(await actual<typeof import("@/lib/conditions")>()), pageGate: () => gate }));

// The person's own entitlements row, as RLS lets them read it.
let user: { id: string; email?: string } | null = { id: "u1", email: "a@example.com" };
let entitlement: { data: unknown; error: unknown } = { data: null, error: null };
let country: string | null = "FR";
// The deal the page shows and the checkout charges (lib/plus/prices plusDeal), mocked here; its own
// rules (the currency, the coupon in that currency, once only) are prices.test.
type Deal = { currency: string; year: number; firstYear: number | null; coupon: string | null };
let deal: Deal | null = { currency: "eur", year: 4999, firstYear: null, coupon: null };
const dealCalls: [string | null, boolean][] = [];
vi.mock("@/lib/plus/prices", () => ({ plusDeal: async (c: string | null, withOffer: boolean) => (dealCalls.push([c, withOffer]), deal) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, v: string) => ({
          maybeSingle: async () => (v !== user?.id ? { data: null, error: "wrong" } : table === "entitlements" ? entitlement : table === "profiles" ? { data: { country }, error: null } : { data: null, error: "wrong" }),
        }),
      }),
    }),
  }),
}));

const listed: Record<string, object[]> = { complete: [], open: [] };
const stripe = {
  checkout: {
    sessions: {
      list: vi.fn((p: { status: string }) => ({
        async *[Symbol.asyncIterator]() {
          yield* listed[p.status];
        },
      })),
      expire: vi.fn(async () => ({})),
      create: vi.fn(async (_p: object, o: { idempotencyKey: string }) => ({ id: `cs_${o.idempotencyKey}` })),
      retrieve: vi.fn(async (id: string) => ({ id, status: "open", url: `https://checkout.stripe.test/${id}` })),
    },
  },
};
const retrieveSub = vi.fn();
vi.mock("@/lib/plus/stripe", async (actual) => ({
  ...(await actual<typeof import("@/lib/plus/stripe")>()),
  getStripe: () => stripe,
  stripeConfigured: () => true,
  retrieveSubscriptionOrNull: (...a: unknown[]) => retrieveSub(...a),
}));
const { POST } = await import("./route");

const ORIGIN = "https://www.moodbow.com";
const post = (body: object = { locale: "en" }, origin: string | null = ORIGIN) =>
  POST(new Request(`${ORIGIN}/api/checkout/stripe`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", host: "www.moodbow.com", ...(origin ? { origin } : {}) } }));
const createParams = () => stripe.checkout.sessions.create.mock.calls[0][0] as Record<string, unknown>;
const later = new Date(Date.now() + 200 * 86_400_000).toISOString();
const row = (over: object = {}) => ({ user_id: "u1", source: "stripe", status: "canceled", trial_ends_at: null, current_period_end: null, trial_started_at: null, store_customer_id: null, store_subscription_id: null, store_product_id: null, ...over });

beforeEach(() => {
  gate = "draft";
  user = { id: "u1", email: "a@example.com" };
  entitlement = { data: null, error: null };
  country = "FR";
  deal = { currency: "eur", year: 4999, firstYear: null, coupon: null };
  dealCalls.length = 0;
  listed.complete = [];
  listed.open = [];
  vi.stubEnv("STRIPE_PLUS_PRICE_ID", "price_plus_yearly");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/checkout/stripe", () => {
  it("first time: a subscription checkout for the yearly price, 7 free days, the card taken, back to Plus; no amount sent", async () => {
    const res = await post({ locale: "es" });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const p = createParams();
    expect(p.mode).toBe("subscription");
    expect(p.line_items).toEqual([{ price: "price_plus_yearly", quantity: 1 }]);
    expect(JSON.stringify(p)).not.toMatch(/unit_amount|price_data/);
    expect(p.payment_method_collection).toBe("always");
    expect(p.subscription_data).toEqual({ metadata: { user_id: "u1", app: "moodbow" }, trial_period_days: 7, trial_settings: { end_behavior: { missing_payment_method: "cancel" } } });
    // Tagged as Moodbow's, the subscription and the session: the account is shared with SolvyMed (ours.ts).
    expect(p.metadata).toMatchObject({ user_id: "u1", app: "moodbow" });
    expect(p.client_reference_id).toBe("u1");
    expect(p.customer_email).toBe("a@example.com");
    expect(p.locale).toBe("es");
    expect(p.success_url).toBe(`${ORIGIN}/es/app/me/plus?started=1`);
    expect(p.cancel_url).toBe(`${ORIGIN}/es/app/me/plus`);
  });

  // Stripe Tax is off unless STRIPE_AUTOMATIC_TAX=1 (UX, 20 Nov): Stripe doesn't offer it to a Thailand-based business,
  // and with it on every Checkout Session on this account fails.
  it("no STRIPE_AUTOMATIC_TAX: no automatic tax, no address asked for it, nothing saved back", async () => {
    entitlement = { data: row({ store_customer_id: "cus_9" }), error: null };
    await post();
    const p = createParams();
    expect(p).not.toHaveProperty("automatic_tax");
    expect(p).not.toHaveProperty("billing_address_collection");
    expect(p).not.toHaveProperty("customer_update");
  });

  it("STRIPE_AUTOMATIC_TAX set to anything but 1: still off", async () => {
    vi.stubEnv("STRIPE_AUTOMATIC_TAX", "true");
    await post();
    expect(createParams()).not.toHaveProperty("automatic_tax");
  });

  it("STRIPE_AUTOMATIC_TAX=1: automatic tax on, the address asked only where needed; a new customer gets no customer_update", async () => {
    vi.stubEnv("STRIPE_AUTOMATIC_TAX", "1");
    await post();
    const p = createParams();
    expect(p.automatic_tax).toEqual({ enabled: true });
    expect(p.billing_address_collection).toBe("auto");
    expect(p.customer_update).toBeUndefined();
  });

  it("STRIPE_AUTOMATIC_TAX=1, a returning customer: the address and name Checkout collects are saved back to them", async () => {
    vi.stubEnv("STRIPE_AUTOMATIC_TAX", "1");
    entitlement = { data: row({ store_customer_id: "cus_9" }), error: null };
    await post();
    const p = createParams();
    expect(p.customer).toBe("cus_9");
    expect(p.automatic_tax).toEqual({ enabled: true });
    expect(p.customer_update).toEqual({ address: "auto", name: "auto" });
  });

  it("the currency the page showed is the one charged: the session carries it (the Reviewer, #315)", async () => {
    await post();
    expect(createParams().currency).toBe("eur");
    expect(dealCalls.at(-1)?.[0]).toBe("FR");
    expect(String(stripe.checkout.sessions.create.mock.calls[0][1]?.idempotencyKey)).toContain("-eur-");
  });

  it("the Christmas offer (1.3): the coupon instead of the free week, exactly when the deal has a first-year price", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-10T12:00:00Z"));
    try {
      deal = { currency: "eur", year: 4999, firstYear: 2499, coupon: "coupon_xmas" };
      await post();
      const p = createParams();
      expect(dealCalls.at(-1)).toEqual(["FR", true]);
      expect(p.discounts).toEqual([{ coupon: "coupon_xmas" }]);
      expect(p.subscription_data).toEqual({ metadata: { user_id: "u1", app: "moodbow" } });
      expect(p.metadata).toMatchObject({ offer: "christmas", app: "moodbow" });
      expect(String(stripe.checkout.sessions.create.mock.calls[0][1]?.idempotencyKey)).toContain("-offer-");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the coupon has no amount in this currency (the page showed the free week): the free week, no coupon", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-10T12:00:00Z"));
    try {
      country = "PL";
      deal = { currency: "pln", year: 23999, firstYear: null, coupon: null };
      await post();
      const p = createParams();
      expect(p.discounts).toBeUndefined();
      expect(p.currency).toBe("pln");
      expect(p.subscription_data).toMatchObject({ trial_period_days: 7 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("not eligible (a free week before): the offer isn't even asked for", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-10T12:00:00Z"));
    try {
      entitlement = { data: row({ trial_started_at: "2025-01-01T00:00:00Z" }), error: null };
      await post();
      expect(dealCalls.at(-1)?.[1]).toBe(false);
      expect(createParams().discounts).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the profile or Stripe can't be read: check_failed, never a guess", async () => {
    deal = null;
    expect((await post()).status).toBe(503);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("the free week was used before (any store): no trial this time, the same customer", async () => {
    entitlement = { data: row({ trial_started_at: "2025-01-01T00:00:00Z", store_customer_id: "cus_9" }), error: null };
    await post();
    const p = createParams();
    expect(p.subscription_data).toEqual({ metadata: { user_id: "u1", app: "moodbow" } });
    expect(p.customer).toBe("cus_9");
    expect(p.customer_email).toBeUndefined();
    // The open-session sweep is this customer's only (Reviewer, #270).
    expect(stripe.checkout.sessions.list).toHaveBeenCalledWith({ status: "open", limit: 100, customer: "cus_9" });
    expect(p.success_url).toBe(`${ORIGIN}/app/me/plus?started=1`);
  });

  it("already has Plus (any store): 409, no checkout", async () => {
    entitlement = { data: row({ source: "play", status: "active", current_period_end: later }), error: null };
    expect(await (await post()).json()).toEqual({ code: "already_plus" });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("Stripe says the stored subscription is live (the webhook hasn't landed): 409; still collectable: fix the card, never a second one", async () => {
    entitlement = { data: row({ store_subscription_id: "sub_1" }), error: null };
    retrieveSub.mockResolvedValueOnce({ id: "sub_1", status: "trialing" });
    expect((await post()).status).toBe(409);
    retrieveSub.mockResolvedValueOnce({ id: "sub_1", status: "past_due" });
    expect(await (await post()).json()).toEqual({ code: "payment_failed" });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("a checkout finished minutes ago whose subscription is live: 409", async () => {
    listed.complete = [{ client_reference_id: "u1", subscription: "sub_2" }];
    retrieveSub.mockResolvedValueOnce({ id: "sub_2", status: "trialing" });
    expect(await (await post()).json()).toEqual({ code: "already_plus" });
  });

  it("another open checkout of theirs is expired first; someone else's is left alone", async () => {
    listed.open = [
      { id: "cs_old", client_reference_id: "u1", metadata: { checkout_key: "older" } },
      { id: "cs_other", client_reference_id: "u2", metadata: {} },
    ];
    await post();
    expect(stripe.checkout.sessions.expire.mock.calls).toEqual([["cs_old"]]);
  });

  it("a double tap: the same idempotency key within the window", async () => {
    await post();
    await post();
    const keys = stripe.checkout.sessions.create.mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    // The charged currency is part of the key (one shared deal, #315).
    expect(keys[0]).toMatch(/^plus-checkout-u1-en-[a-z]{3}-trial-\d+$/);
  });

  it("a key replaying an expired session: the next key in the sequence", async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce({ id: "x", status: "expired", url: null } as never);
    const res = await post();
    expect(res.status).toBe(200);
    expect((stripe.checkout.sessions.create.mock.calls[1][1] as { idempotencyKey: string }).idempotencyKey).toMatch(/-r1$/);
  });

  it("fails closed: a row it can't read, or Stripe it can't ask, is never 'no subscription'", async () => {
    entitlement = { data: null, error: { message: "down" } };
    expect(await (await post()).json()).toEqual({ code: "check_failed" });
    entitlement = { data: row({ store_subscription_id: "sub_1" }), error: null };
    retrieveSub.mockRejectedValueOnce(new Error("down"));
    expect(await (await post()).json()).toEqual({ code: "check_failed" });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("refused: another origin, signed out, no email, no price set, Plus off", async () => {
    expect((await post({}, "https://evil.example")).status).toBe(403);
    user = null;
    expect((await post()).status).toBe(401);
    user = { id: "u1" };
    expect(await (await post()).json()).toEqual({ code: "needs_email" });
    user = { id: "u1", email: "a@example.com" };
    vi.stubEnv("STRIPE_PLUS_PRICE_ID", "");
    expect(await (await post()).json()).toEqual({ code: "not_configured" });
    gate = "hidden";
    expect((await post()).status).toBe(404);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("several prices of ours (STRIPE_PLUS_PRICE_ID, comma-separated): the first is the one sold", async () => {
    vi.stubEnv("STRIPE_PLUS_PRICE_ID", " price_new , price_old");
    await post();
    expect(createParams().line_items).toEqual([{ price: "price_new", quantity: 1 }]);
    vi.stubEnv("STRIPE_PLUS_PRICE_ID", " , ");
    expect(await (await post()).json()).toEqual({ code: "not_configured" });
  });

  it("a locale that isn't one of ours: English URLs", async () => {
    await post({ locale: "../evil" });
    expect(createParams().success_url).toBe(`${ORIGIN}/app/me/plus?started=1`);
  });
});
