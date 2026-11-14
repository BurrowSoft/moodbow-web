// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The app's delete with web Plus (the Reviewer's payments audit, 14 Nov): the real
// cancelStripeBeforeDelete behind the route, Stripe and the token check mocked.
let gate: "live" | "draft" | "hidden" = "draft";
vi.mock("@/lib/conditions", async (orig) => ({ ...(await orig<typeof import("@/lib/conditions")>()), pageGate: () => gate }));

type Who = { kind: "ok"; client: unknown; uid: string } | { kind: "missing" | "invalid" | "outage" | "not_configured" };
let who: Who = { kind: "missing" };
const bearerUser = vi.fn(async () => who);
vi.mock("@/lib/supabase/bearer", () => ({ bearerUser: (...a: unknown[]) => bearerUser(...(a as [])) }));

const cancel = vi.fn(async (id: string) => ({ id, status: "canceled" }));
const retrieveSub = vi.fn();
vi.mock("@/lib/plus/stripe", () => ({
  stripeConfigured: () => true,
  getStripe: () => ({ subscriptions: { cancel: (id: string) => cancel(id) } }),
  retrieveSubscriptionOrNull: (id: string) => retrieveSub(id),
}));

// The caller's own client: its entitlements read is recorded (which user it asked for).
const asked: string[] = [];
const clientFor = (row: Record<string, unknown> | null) => ({
  from: (table: string) => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = (col: string, v: string) => (asked.push(`${table}.${col}=${v}`), c);
    c.maybeSingle = async () => ({ data: row, error: null });
    return c;
  },
});
const STRIPE_ROW = { user_id: "u1", status: "active", source: "stripe", store_subscription_id: "sub_1", current_period_end: "2027-11-01T00:00:00Z", trial_started_at: null };

const { POST } = await import("./route");
const call = (headers: Record<string, string> = { authorization: "Bearer good" }) => POST(new Request("https://moodbow.app/api/plus/cancel-for-delete", { method: "POST", headers }));

beforeEach(() => {
  gate = "draft";
  asked.length = 0;
  cancel.mockClear();
  retrieveSub.mockReset();
  bearerUser.mockClear();
  who = { kind: "ok", client: clientFor(STRIPE_ROW), uid: "u1" };
});

describe("POST /api/plus/cancel-for-delete", () => {
  it("no token, or not a valid one: 401, and Stripe is never touched", async () => {
    who = { kind: "missing" };
    let res = await call({});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "signed_out" });
    who = { kind: "invalid" };
    res = await call({ authorization: "Bearer forged" });
    expect(res.status).toBe(401);
    expect(retrieveSub).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("their running web subscription: cancelled now, read as their own row; calling again is safe", async () => {
    retrieveSub.mockResolvedValueOnce({ id: "sub_1", status: "active", metadata: { user_id: "u1" } });
    let res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "cancelled" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("sub_1");
    expect(asked).toEqual(["entitlements.user_id=u1"]);
    // Again (the app retried): Stripe now says canceled, so nothing more is done.
    retrieveSub.mockResolvedValueOnce({ id: "sub_1", status: "canceled", metadata: { user_id: "u1" } });
    res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "none" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("only the caller's own: a subscription that isn't theirs is never cancelled", async () => {
    retrieveSub.mockResolvedValueOnce({ id: "sub_1", status: "active", metadata: { user_id: "someone-else" } });
    const res = await call();
    expect(await res.json()).toEqual({ status: "none" });
    expect(cancel).not.toHaveBeenCalled();
  });

  it("nothing on the web to cancel (Play, Apple, no row): 200 none", async () => {
    who = { kind: "ok", client: clientFor({ ...STRIPE_ROW, source: "play", store_subscription_id: "gp_1" }), uid: "u1" };
    expect(await (await call()).json()).toEqual({ status: "none" });
    who = { kind: "ok", client: clientFor(null), uid: "u1" };
    expect(await (await call()).json()).toEqual({ status: "none" });
    expect(retrieveSub).not.toHaveBeenCalled();
  });

  it("Stripe failing: 202 left_for_cron (the delete's queue ends it), never an error that blocks the delete", async () => {
    retrieveSub.mockRejectedValueOnce(new Error("stripe down"));
    const res = await call();
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: "left_for_cron" });
  });

  it("Auth unreachable: 503 generic, nothing touched; Plus off: 404", async () => {
    who = { kind: "outage" };
    let res = await call();
    expect(res.status).toBe(503);
    expect(retrieveSub).not.toHaveBeenCalled();
    gate = "hidden";
    res = await call();
    expect(res.status).toBe(404);
    expect(bearerUser).toHaveBeenCalledTimes(1);
  });
});
