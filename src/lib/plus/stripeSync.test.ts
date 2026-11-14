// @vitest-environment node
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import type { EntitlementRow } from "./entitlements";
import { desiredFor, subscriptionIdOf, syncSubscription, type SyncDeps } from "./stripeSync";

const T = 1_800_000_000; // seconds
const sub = (over: Partial<Stripe.Subscription> & { periodEnd?: number | null } = {}): Stripe.Subscription => {
  const { periodEnd = T + 365 * 86_400, ...rest } = over;
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    metadata: { user_id: "u1" },
    trial_start: null,
    trial_end: null,
    items: { data: [{ current_period_end: periodEnd, price: { id: "price_1" } }] },
    ...rest,
  } as unknown as Stripe.Subscription;
};
const iso = (s: number) => new Date(s * 1000).toISOString();
const row = (over: Partial<EntitlementRow> = {}): EntitlementRow => ({
  user_id: "u1",
  source: "stripe",
  status: "active",
  trial_ends_at: null,
  current_period_end: iso(T + 365 * 86_400),
  trial_started_at: null,
  store_customer_id: "cus_1",
  store_subscription_id: "sub_1",
  store_product_id: "price_1",
  ...over,
});

// A fake table of one row, and Stripe's subscriptions by id (each read takes the next state).
function fakes(stripeStates: Record<string, Stripe.Subscription[]>, start: EntitlementRow | null) {
  let stored = start;
  const reads: Record<string, number> = {};
  const deps: SyncDeps = {
    retrieve: vi.fn(async (id: string) => {
      const list = stripeStates[id];
      if (!list) return null;
      const n = (reads[id] = (reads[id] ?? 0) + 1);
      return list[Math.min(n, list.length) - 1];
    }),
    read: vi.fn(async () => ({ ok: true as const, value: stored })),
    insert: vi.fn(async (user_id, r) => {
      if (stored) return { ok: true as const, value: false };
      stored = { user_id, ...r };
      return { ok: true as const, value: true };
    }),
    update: vi.fn(async (user_id, seen, r) => {
      if (!stored || stored.source !== seen.source || stored.store_subscription_id !== seen.store_subscription_id) return { ok: true as const, value: false };
      stored = { user_id, ...r };
      return { ok: true as const, value: true };
    }),
  };
  return { deps, now: () => stored };
}

describe("desiredFor: the row a subscription should give", () => {
  it("a trial: trialing until the trial's end, the person from the subscription's metadata", () => {
    const d = desiredFor(sub({ status: "trialing", trial_start: T, trial_end: T + 7 * 86_400, periodEnd: T + 7 * 86_400 }));
    expect(d).toEqual({
      kind: "write",
      userId: "u1",
      live: true,
      row: {
        source: "stripe",
        status: "trialing",
        trial_ends_at: iso(T + 7 * 86_400),
        current_period_end: iso(T + 7 * 86_400),
        trial_started_at: iso(T),
        store_customer_id: "cus_1",
        store_subscription_id: "sub_1",
        store_product_id: "price_1",
      },
    });
  });
  it("no person, or live with no period end: nothing written", () => {
    expect(desiredFor(sub({ metadata: {} }))).toEqual({ kind: "skip", reason: "no_user" });
    expect(desiredFor(sub({ periodEnd: null }))).toEqual({ kind: "skip", reason: "no_period_end" });
  });
});

describe("syncSubscription: the live state, never the payload", () => {
  it("a new subscription: inserted as Stripe has it now, then read again to confirm", async () => {
    const { deps, now } = fakes({ sub_1: [sub({ status: "trialing", trial_start: T, trial_end: T + 604_800, periodEnd: T + 604_800 })] }, null);
    expect(await syncSubscription("sub_1", deps)).toEqual({ kind: "written" });
    expect(now()).toMatchObject({ status: "trialing", store_subscription_id: "sub_1", trial_started_at: iso(T) });
    expect(deps.retrieve).toHaveBeenCalledTimes(2);
  });

  it("Stripe moves on while writing: it writes again, until a read matches what's on the row", async () => {
    const { deps, now } = fakes({ sub_1: [sub(), sub({ status: "canceled" }), sub({ status: "canceled" })] }, row());
    expect(await syncSubscription("sub_1", deps)).toEqual({ kind: "written" });
    expect(now()?.status).toBe("canceled");
  });

  it("a late event for an old subscription can't end the newer one", async () => {
    const { deps, now } = fakes({ sub_old: [sub({ id: "sub_old", status: "canceled" })], sub_1: [sub()] }, row());
    expect(await syncSubscription("sub_old", deps)).toEqual({ kind: "skipped", reason: "older_subscription" });
    expect(now()?.store_subscription_id).toBe("sub_1");
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("a live new subscription takes the row from a dead one", async () => {
    const { deps, now } = fakes({ sub_2: [sub({ id: "sub_2" })] }, row({ status: "canceled" }));
    expect(await syncSubscription("sub_2", deps)).toEqual({ kind: "written" });
    expect(now()).toMatchObject({ status: "active", store_subscription_id: "sub_2" });
  });

  it("past_due is written, and cuts Plus", async () => {
    const { deps, now } = fakes({ sub_1: [sub({ status: "past_due" })] }, row());
    await syncSubscription("sub_1", deps);
    expect(now()?.status).toBe("past_due");
  });

  it("Plus from Play or Apple that still grants is never ended by a Stripe event", async () => {
    const play = row({ source: "play", store_subscription_id: "token" });
    const { deps, now } = fakes({ sub_1: [sub({ status: "canceled" })] }, play);
    expect(await syncSubscription("sub_1", deps)).toEqual({ kind: "skipped", reason: "other_store_grants" });
    expect(now()).toEqual(play);
  });

  it("the free week stays used: a later subscription never clears trial_started_at", async () => {
    const { deps, now } = fakes({ sub_2: [sub({ id: "sub_2" })] }, row({ status: "canceled", trial_started_at: iso(T - 400 * 86_400) }));
    await syncSubscription("sub_2", deps);
    expect(now()?.trial_started_at).toBe(iso(T - 400 * 86_400));
  });

  it("Stripe or the table failing: retried (a 5xx), nothing guessed from the event", async () => {
    const { deps } = fakes({}, null);
    deps.retrieve = vi.fn(async () => {
      throw new Error("down");
    });
    expect(await syncSubscription("sub_1", deps)).toEqual({ kind: "retry", reason: "stripe" });
    const second = fakes({ sub_1: [sub()] }, null);
    second.deps.read = vi.fn(async () => ({ ok: false as const }));
    expect(await syncSubscription("sub_1", second.deps)).toEqual({ kind: "retry", reason: "db" });
  });

  it("unknown to Stripe, or naming nobody: skipped, never retried", async () => {
    expect(await syncSubscription("sub_x", fakes({}, null).deps)).toEqual({ kind: "skipped", reason: "unknown_subscription" });
    expect(await syncSubscription("sub_1", fakes({ sub_1: [sub({ metadata: {} })] }, null).deps)).toEqual({ kind: "skipped", reason: "no_user" });
  });
});

describe("subscriptionIdOf: which subscription an event is about", () => {
  const ev = (type: string, object: object) => ({ type, data: { object } }) as unknown as Stripe.Event;
  it("checkout (trial or paid), the subscription events and a failed invoice", () => {
    expect(subscriptionIdOf(ev("checkout.session.completed", { subscription: "sub_1", payment_status: "no_payment_required" }))).toBe("sub_1");
    expect(subscriptionIdOf(ev("checkout.session.completed", { subscription: { id: "sub_2" } }))).toBe("sub_2");
    for (const t of ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]) expect(subscriptionIdOf(ev(t, { id: "sub_3" }))).toBe("sub_3");
    expect(subscriptionIdOf(ev("invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_4" } } }))).toBe("sub_4");
  });
  it("anything else: nothing to do", () => {
    expect(subscriptionIdOf(ev("customer.created", { id: "cus_1" }))).toBeNull();
    expect(subscriptionIdOf(ev("checkout.session.completed", { subscription: null }))).toBeNull();
  });
});
