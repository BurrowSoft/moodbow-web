import { timingSafeEqual } from "node:crypto";
import { hasPlus, type EntitlementRow } from "./entitlements";

// The daily Stripe ↔ entitlements check (Moodbow Plus, SolvyMed's pattern):
// read-only on both sides. The webhook keeps the rows in step with Stripe;
// this catches what it missed (a lost event, a change in the Dashboard)
// before someone paying has no Plus, or someone with Plus isn't paying. Pure:
// the route lists both sides, this compares them. Ids and statuses only.

export type StripeSubLite = { id: string; status: string; userId: string | null; created: number };

export type Mismatch =
  | { kind: "paying_without_plus"; userId: string; subscriptionId: string; stripeStatus: string; rowStatus: string | null; rowSubscriptionId: string | null }
  | { kind: "plus_without_payment"; userId: string; subscriptionId: string | null; stripeStatus: string | null }
  | { kind: "no_user"; subscriptionId: string; stripeStatus: string };

const live = (status: string) => status === "active" || status === "trialing";
// A subscription from the last hour may still be on its way through the
// webhook: not a mismatch yet (the next day's run sees it).
const GRACE_S = 60 * 60;

export function reconcile(subs: StripeSubLite[], rows: EntitlementRow[], nowMs = Date.now()): Mismatch[] {
  const out: Mismatch[] = [];
  const byUser = new Map(rows.map((r) => [r.user_id, r]));
  const byId = new Map(subs.map((s) => [s.id, s]));
  for (const s of subs) {
    if (!live(s.status) || s.created > nowMs / 1000 - GRACE_S) continue;
    if (!s.userId) {
      out.push({ kind: "no_user", subscriptionId: s.id, stripeStatus: s.status });
      continue;
    }
    const row = byUser.get(s.userId);
    if (!row || !hasPlus(row, nowMs) || row.store_subscription_id !== s.id) {
      out.push({ kind: "paying_without_plus", userId: s.userId, subscriptionId: s.id, stripeStatus: s.status, rowStatus: row?.status ?? null, rowSubscriptionId: row?.store_subscription_id ?? null });
    }
  }
  for (const r of rows) {
    if (!hasPlus(r, nowMs)) continue;
    const s = r.store_subscription_id ? byId.get(r.store_subscription_id) : undefined;
    if (!s || !live(s.status)) out.push({ kind: "plus_without_payment", userId: r.user_id, subscriptionId: r.store_subscription_id, stripeStatus: s?.status ?? null });
  }
  return out;
}

// Vercel Cron calls with "Authorization: Bearer $CRON_SECRET". Without the
// secret set, every call is refused.
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  const s = secret?.trim();
  if (!s) return false;
  const want = Buffer.from(`Bearer ${s}`);
  const got = Buffer.from(header ?? "");
  return got.length === want.length && timingSafeEqual(got, want);
}
