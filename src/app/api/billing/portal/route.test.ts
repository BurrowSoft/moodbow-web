// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let gate = "draft";
vi.mock("@/lib/conditions", () => ({ pageGate: () => gate }));
let user: { id: string } | null = { id: "u1" };
let entitlement: { data: unknown; error: unknown } = { data: null, error: null };
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => entitlement }) }) }),
  }),
}));
const portalCreate = vi.fn(async () => ({ url: "https://billing.stripe.test/p" }));
const retrieveSub = vi.fn();
vi.mock("@/lib/plus/stripe", async (actual) => ({
  ...(await actual<typeof import("@/lib/plus/stripe")>()),
  getStripe: () => ({ billingPortal: { sessions: { create: portalCreate } } }),
  stripeConfigured: () => true,
  retrieveSubscriptionOrNull: (...a: unknown[]) => retrieveSub(...a),
}));
const { POST } = await import("./route");

const ORIGIN = "https://www.moodbow.com";
const post = (body: object = { locale: "pt-br" }, origin = ORIGIN) => POST(new Request(`${ORIGIN}/api/billing/portal`, { method: "POST", body: JSON.stringify(body), headers: { origin } }));
const stripeRow = { user_id: "u1", source: "stripe", status: "active", store_subscription_id: "sub_1" };

beforeEach(() => {
  gate = "draft";
  user = { id: "u1" };
  entitlement = { data: stripeRow, error: null };
  retrieveSub.mockResolvedValue({ id: "sub_1", customer: "cus_1", metadata: { user_id: "u1" } });
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/billing/portal", () => {
  it("their own Stripe subscription: the portal for its customer, in their language, back to Plus", async () => {
    expect(await (await post()).json()).toEqual({ url: "https://billing.stripe.test/p" });
    expect(portalCreate).toHaveBeenCalledWith({ customer: "cus_1", locale: "pt-BR", return_url: `${ORIGIN}/pt-br/app/me/plus` });
  });

  it("Plus from a store, no row, or a subscription that isn't theirs: nothing to manage, never someone else's portal", async () => {
    entitlement = { data: { ...stripeRow, source: "play" }, error: null };
    expect((await post()).status).toBe(404);
    entitlement = { data: null, error: null };
    expect((await post()).status).toBe(404);
    entitlement = { data: stripeRow, error: null };
    retrieveSub.mockResolvedValueOnce({ id: "sub_1", customer: "cus_2", metadata: { user_id: "u2" } });
    expect((await post()).status).toBe(404);
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("the portal not set up: portal_unavailable, never a new checkout", async () => {
    portalCreate.mockRejectedValueOnce(new Error("no configuration"));
    expect(await (await post()).json()).toEqual({ code: "portal_unavailable" });
  });

  it("refused: another origin, signed out, Plus off", async () => {
    expect((await post({}, "https://evil.example")).status).toBe(403);
    user = null;
    expect((await post()).status).toBe(401);
    gate = "hidden";
    expect((await post()).status).toBe(404);
  });
});
