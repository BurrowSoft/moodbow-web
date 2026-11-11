import { describe, expect, it } from "vitest";
import type { EntitlementRow } from "./entitlements";
import { insightsOffer, plusAiRows, plusPriceLabel, plusView } from "./view";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const DAY = 86_400_000;
const at = (ms: number) => new Date(ms).toISOString();
const row = (over: Partial<EntitlementRow> = {}): EntitlementRow => ({
  user_id: "u1",
  source: "stripe",
  status: "active",
  trial_ends_at: null,
  current_period_end: at(NOW + 300 * DAY),
  trial_started_at: at(NOW - 400 * DAY),
  store_customer_id: "cus_1",
  store_subscription_id: "sub_1",
  store_product_id: "price_1",
  ...over,
});

describe("plusView: what a page shows about Plus", () => {
  it("no row: free, with the 7 free days", () => {
    expect(plusView(null, NOW)).toEqual({ kind: "free", trial: true });
  });
  it("Plus from any store; the days left only during the free week", () => {
    expect(plusView(row(), NOW)).toEqual({ kind: "plus", source: "stripe", daysLeft: null, until: at(NOW + 300 * DAY) });
    expect(plusView(row({ source: "apple" }), NOW)).toMatchObject({ kind: "plus", source: "apple", daysLeft: null });
    expect(plusView(row({ status: "trialing", trial_ends_at: at(NOW + 5 * DAY), current_period_end: at(NOW + 5 * DAY) }), NOW)).toEqual({ kind: "plus", source: "stripe", daysLeft: 5, until: at(NOW + 5 * DAY) });
  });
  it("a failed Stripe renewal: the card state, not an offer", () => {
    expect(plusView(row({ status: "past_due" }), NOW)).toEqual({ kind: "past_due" });
  });
  it("ended, with the free week used: free, without the trial", () => {
    expect(plusView(row({ status: "canceled" }), NOW)).toEqual({ kind: "free", trial: false });
    expect(plusView(row({ current_period_end: at(NOW - 1) }), NOW)).toEqual({ kind: "free", trial: false });
  });
});

describe("plusAiRows: the table's AI rows only once AI is live (decision 69)", () => {
  it("ai-live unmet: no AI rows, wherever AI would be available", () => {
    expect(plusAiRows({ ai_available: true }, () => false)).toBe(false);
  });
  it("ai-live met: only where AI is available", () => {
    expect(plusAiRows({ ai_available: true }, () => true)).toBe(true);
    expect(plusAiRows({ ai_available: false }, () => true)).toBe(false);
    expect(plusAiRows({}, () => true)).toBe(false);
  });
});

describe("insightsOffer: Insights' locked items", () => {
  it("without Plus: offered, with or without the free week", () => {
    expect(insightsOffer({ kind: "free", trial: true }, false, "US$59.99")).toEqual({ trial: true, price: "US$59.99" });
    expect(insightsOffer({ kind: "free", trial: false }, false, "US$59.99")).toEqual({ trial: false, price: "US$59.99" });
    expect(insightsOffer({ kind: "past_due" }, false, "US$59.99")).toEqual({ trial: false, price: "US$59.99" });
  });
  it("a hard week: nothing about Plus beside the help offer (UX, #271)", () => {
    expect(insightsOffer({ kind: "free", trial: true }, true, "US$59.99")).toBeNull();
  });
  it("has Plus, or the row can't be read: nothing", () => {
    expect(insightsOffer({ kind: "plus", source: "stripe", daysLeft: null }, false, "US$59.99")).toBeNull();
    expect(insightsOffer(null, false, "US$59.99")).toBeNull();
  });
});

describe("plusPriceLabel: US$59.99 in the language's own format, never a bare $", () => {
  it.each(["en", "fr", "es", "pt-br", "de", "it", "th"])("%s", (locale) => {
    const label = plusPriceLabel(locale);
    expect(label).toMatch(/59[.,]99/);
    expect(label).toMatch(/US|USD/);
  });
  it("English: US$59.99", () => {
    expect(plusPriceLabel("en")).toBe("US$59.99");
  });
});
