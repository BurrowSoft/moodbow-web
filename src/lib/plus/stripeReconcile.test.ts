// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { EntitlementRow } from "./entitlements";
import { cronAuthorized, reconcile, type StripeSubLite } from "./stripeReconcile";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const OLD = NOW / 1000 - 2 * 60 * 60;
const row = (over: Partial<EntitlementRow> = {}): EntitlementRow => ({
  user_id: "u1",
  source: "stripe",
  status: "active",
  trial_ends_at: null,
  current_period_end: new Date(NOW + 86_400_000).toISOString(),
  trial_started_at: null,
  store_customer_id: "cus_1",
  store_subscription_id: "sub_1",
  store_product_id: "price_1",
  ...over,
});
const sub = (over: Partial<StripeSubLite> = {}): StripeSubLite => ({ id: "sub_1", status: "active", userId: "u1", created: OLD, ...over });

describe("reconcile: Stripe against the rows, read-only", () => {
  it("in step: nothing to report", () => {
    expect(reconcile([sub()], [row()], NOW)).toEqual([]);
    expect(reconcile([sub({ status: "trialing" })], [row({ status: "trialing" })], NOW)).toEqual([]);
    expect(reconcile([sub({ status: "canceled" })], [row({ status: "canceled" })], NOW)).toEqual([]);
  });
  it("paying without Plus: no row, a row that doesn't grant, or one on another subscription", () => {
    expect(reconcile([sub()], [], NOW)).toEqual([{ kind: "paying_without_plus", userId: "u1", subscriptionId: "sub_1", stripeStatus: "active", rowStatus: null, rowSubscriptionId: null }]);
    expect(reconcile([sub()], [row({ status: "past_due" })], NOW)[0]).toMatchObject({ kind: "paying_without_plus", rowStatus: "past_due" });
    expect(reconcile([sub({ id: "sub_2" })], [row()], NOW).map((m) => m.kind)).toEqual(["paying_without_plus", "plus_without_payment"]);
  });
  it("Plus without payment: the stored subscription isn't live, or Stripe doesn't have it", () => {
    expect(reconcile([sub({ status: "canceled" })], [row()], NOW)).toEqual([{ kind: "plus_without_payment", userId: "u1", subscriptionId: "sub_1", stripeStatus: "canceled" }]);
    expect(reconcile([], [row()], NOW)).toEqual([{ kind: "plus_without_payment", userId: "u1", subscriptionId: "sub_1", stripeStatus: null }]);
  });
  it("a live subscription naming nobody", () => {
    expect(reconcile([sub({ userId: null })], [], NOW)).toEqual([{ kind: "no_user", subscriptionId: "sub_1", stripeStatus: "active" }]);
  });
  it("the last hour is the webhook's: not a mismatch yet", () => {
    expect(reconcile([sub({ created: NOW / 1000 - 60 })], [], NOW)).toEqual([]);
  });
});

describe("cronAuthorized: Vercel Cron's bearer secret", () => {
  it("only the exact header, and never without a secret set", () => {
    expect(cronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
    expect(cronAuthorized("Bearer s3cre", "s3cret")).toBe(false);
    expect(cronAuthorized("s3cret", "s3cret")).toBe(false);
    expect(cronAuthorized(null, "s3cret")).toBe(false);
    expect(cronAuthorized("Bearer ", "")).toBe(false);
    expect(cronAuthorized("Bearer undefined", undefined)).toBe(false);
  });
});
