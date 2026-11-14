import type Stripe from "stripe";
import { hasPlus, type EntitlementRow } from "./entitlements";
import { entitlementStatus, isLive } from "./stripe";
import type { EntitlementWrite } from "./serviceRole";

// The Stripe webhook's write (docs/plus-entitlements.md), SolvyMed's live-state
// sync. It writes the subscription's CURRENT state as Stripe reports it, never
// an event's payload: Stripe doesn't promise delivery order, and a late event
// carries a stale snapshot. Reading live isn't enough under concurrency (two
// deliveries can read, then write in the opposite order), so after writing it
// reads again and writes again if Stripe moved on, until a read matches what
// was written. Pure apart from its deps, which the route passes in.

type Result<T> = { ok: true; value: T } | { ok: false };
export type SyncDeps = {
  retrieve: (id: string) => Promise<Stripe.Subscription | null>;
  read: (userId: string) => Promise<Result<EntitlementRow | null>>;
  insert: (userId: string, row: EntitlementWrite) => Promise<Result<boolean>>;
  update: (userId: string, seen: Pick<EntitlementRow, "source" | "store_subscription_id">, row: EntitlementWrite) => Promise<Result<boolean>>;
};
export type SyncOutcome =
  | { kind: "written" }
  | { kind: "skipped"; reason: "no_user" | "no_period_end" | "other_store_grants" | "older_subscription" | "unknown_subscription" }
  | { kind: "retry"; reason: "stripe" | "db" | "still_changing" };

const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);
const id = (ref: string | { id: string } | null | undefined) => (typeof ref === "string" ? ref : (ref?.id ?? null));

export type Desired = { kind: "skip"; reason: "no_user" | "no_period_end" } | { kind: "write"; userId: string; live: boolean; row: EntitlementWrite };

// What the row should say for this subscription right now.
export function desiredFor(sub: Stripe.Subscription): Desired {
  const userId = sub.metadata?.user_id;
  if (!userId) return { kind: "skip", reason: "no_user" };
  const item = sub.items?.data?.[0];
  const periodEnd = iso(item?.current_period_end);
  const live = isLive(sub);
  // Never grant without a real period end: hasPlus reads none as no Plus, and
  // a granting row must be able to run out.
  if (live && !periodEnd) return { kind: "skip", reason: "no_period_end" };
  return {
    kind: "write",
    userId,
    live,
    row: {
      source: "stripe",
      status: entitlementStatus(sub.status),
      trial_ends_at: iso(sub.trial_end),
      current_period_end: periodEnd,
      trial_started_at: iso(sub.trial_start),
      store_customer_id: id(sub.customer),
      store_subscription_id: sub.id,
      store_product_id: item?.price?.id ?? null,
    },
  };
}

// The subscription a webhook event is about, or null for events that change nothing here.
export function subscriptionIdOf(event: Stripe.Event): string | null {
  switch (event.type) {
    case "checkout.session.completed":
      // A trial's checkout completes as no_payment_required, a paid one as
      // paid; either way the subscription's live state decides.
      return id(event.data.object.subscription);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return event.data.object.id;
    case "invoice.payment_failed":
      return id(event.data.object.parent?.subscription_details?.subscription);
    default:
      return null;
  }
}

const terminal = (s: Stripe.Subscription | null) => !s || s.status === "canceled" || s.status === "incomplete_expired";

export async function syncSubscription(subId: string, deps: SyncDeps): Promise<SyncOutcome> {
  let written: string | null = null;
  for (let round = 0; round < 3; round++) {
    let sub: Stripe.Subscription | null;
    try {
      sub = await deps.retrieve(subId);
    } catch {
      return { kind: "retry", reason: "stripe" };
    }
    if (!sub) return { kind: "skipped", reason: "unknown_subscription" };
    const desired = desiredFor(sub);
    if (desired.kind === "skip") return { kind: "skipped", reason: desired.reason };
    const fingerprint = JSON.stringify(desired.row);
    if (written === fingerprint) return { kind: "written" };

    const current = await deps.read(desired.userId);
    if (!current.ok) return { kind: "retry", reason: "db" };
    const row = current.value;
    // The free week is offered once per person: a later subscription never clears it.
    const next: EntitlementWrite = { ...desired.row, trial_started_at: row?.trial_started_at ?? desired.row.trial_started_at };

    if (!row) {
      const done = await deps.insert(desired.userId, next);
      if (!done.ok) return { kind: "retry", reason: "db" };
      if (!done.value) continue; // a row appeared meanwhile: read again
    } else {
      // Another store's Plus that still grants is never ended by a Stripe event.
      if (row.source !== "stripe" && hasPlus(row)) return { kind: "skipped", reason: "other_store_grants" };
      if (row.source === "stripe" && row.store_subscription_id && row.store_subscription_id !== sub.id && !desired.live) {
        // A subscription that isn't live doesn't replace the stored one,
        // unless the stored one is dead or Stripe doesn't know it (a late
        // event for an old subscription must not end the newer one).
        let stored: Stripe.Subscription | null;
        try {
          stored = await deps.retrieve(row.store_subscription_id);
        } catch {
          return { kind: "retry", reason: "stripe" };
        }
        if (!terminal(stored) || terminal(sub)) return { kind: "skipped", reason: "older_subscription" };
      }
      const done = await deps.update(desired.userId, { source: row.source, store_subscription_id: row.store_subscription_id }, next);
      if (!done.ok) return { kind: "retry", reason: "db" };
      if (!done.value) continue; // changed meanwhile: read again
    }
    written = JSON.stringify(desired.row);
  }
  // Stripe kept changing across every round: Stripe retries later.
  return { kind: "retry", reason: "still_changing" };
}
