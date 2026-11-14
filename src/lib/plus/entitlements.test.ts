import { describe, expect, it } from "vitest";
import { hasPlus, parseEntitlement, trialAvailable, trialDaysLeft, type EntitlementRow } from "./entitlements";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const DAY = 86_400_000;
const at = (ms: number) => new Date(ms).toISOString();
const row = (over: Partial<EntitlementRow> = {}): EntitlementRow => ({
  user_id: "u1",
  source: "stripe",
  status: "active",
  trial_ends_at: null,
  current_period_end: at(NOW + 300 * DAY),
  trial_started_at: null,
  store_customer_id: "cus_1",
  store_subscription_id: "sub_1",
  store_product_id: "price_1",
  ...over,
});

describe("hasPlus: the one rule (has_plus() in SQL)", () => {
  it("trialing or active, inside the period: Plus", () => {
    expect(hasPlus(row(), NOW)).toBe(true);
    expect(hasPlus(row({ status: "trialing", current_period_end: at(NOW + DAY) }), NOW)).toBe(true);
  });
  it.each(["past_due", "paused", "canceled", "expired", "anything"])("%s never grants, even inside the period", (status) => {
    expect(hasPlus(row({ status }), NOW)).toBe(false);
  });
  it("past the period's end, or no end at all: no Plus; no row: no Plus", () => {
    expect(hasPlus(row({ current_period_end: at(NOW - 1) }), NOW)).toBe(false);
    expect(hasPlus(row({ current_period_end: null }), NOW)).toBe(false);
    expect(hasPlus(null, NOW)).toBe(false);
  });
});

describe("trialDaysLeft: Me's counter only", () => {
  const trial = (left: number) => row({ status: "trialing", trial_ends_at: at(NOW + left), current_period_end: at(NOW + left) });
  it("whole days, rounded up, 1 to 7", () => {
    expect(trialDaysLeft(trial(7 * DAY), NOW)).toBe(7);
    expect(trialDaysLeft(trial(6 * DAY + 1), NOW)).toBe(7);
    expect(trialDaysLeft(trial(DAY), NOW)).toBe(1);
    expect(trialDaysLeft(trial(60_000), NOW)).toBe(1);
  });
  it("not a running trial: no counter", () => {
    expect(trialDaysLeft(row(), NOW)).toBeNull();
    expect(trialDaysLeft(trial(-1), NOW)).toBeNull();
    expect(trialDaysLeft(row({ status: "past_due", trial_ends_at: at(NOW + DAY) }), NOW)).toBeNull();
    expect(trialDaysLeft(null, NOW)).toBeNull();
  });
});

describe("trialAvailable: the web's 7 free days once per person", () => {
  it("never started: offered; started once, on any store: not again", () => {
    expect(trialAvailable(null)).toBe(true);
    expect(trialAvailable(row())).toBe(true);
    expect(trialAvailable(row({ trial_started_at: at(NOW - 400 * DAY), status: "canceled" }))).toBe(false);
    expect(trialAvailable(row({ source: "play", trial_started_at: at(NOW - DAY) }))).toBe(false);
  });
});

describe("parseEntitlement", () => {
  it("a row as read; anything malformed is no row", () => {
    expect(parseEntitlement(row())).toEqual(row());
    expect(parseEntitlement({ ...row(), source: "paypal" })).toBeNull();
    expect(parseEntitlement({ ...row(), user_id: 1 })).toBeNull();
    expect(parseEntitlement(null)).toBeNull();
    expect(parseEntitlement({ ...row(), trial_ends_at: 5 })).toEqual(row({ trial_ends_at: null }));
  });
});
