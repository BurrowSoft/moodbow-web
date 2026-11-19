import { describe, expect, it } from "vitest";
import type { ConditionId, PageGate } from "@/lib/conditions";
import { offerActive, offerEligible, offerWindowOpen } from "./offer";

const at = (iso: string) => Date.parse(iso);
const on = (offer: PageGate, plus: PageGate = "live") => (id: ConditionId) => (id === "offer-live" ? offer : id === "plus" ? plus : "hidden");

describe("offerWindowOpen: 1 December to 1 January 00:00 UTC, the server's clock", () => {
  it("the edges", () => {
    expect(offerWindowOpen(at("2026-11-30T23:59:59Z"), {})).toBe(false);
    expect(offerWindowOpen(at("2026-12-01T00:00:00Z"), {})).toBe(true);
    expect(offerWindowOpen(at("2026-12-31T23:59:59Z"), {})).toBe(true);
    expect(offerWindowOpen(at("2027-01-01T00:00:00Z"), {})).toBe(false);
  });
  it("OFFER_PREVIEW opens it on a Preview only; Production and any other build ignore it", () => {
    const nov = at("2026-11-14T12:00:00Z");
    expect(offerWindowOpen(nov, { vercelEnv: "preview", offerPreview: "1" })).toBe(true);
    expect(offerWindowOpen(nov, { vercelEnv: "production", offerPreview: "1" })).toBe(false);
    expect(offerWindowOpen(nov, { vercelEnv: undefined, offerPreview: "1" })).toBe(false);
    expect(offerWindowOpen(nov, { vercelEnv: "preview", offerPreview: "true" })).toBe(false);
  });
});

describe("offerActive: its own switch, with Plus, inside the window", () => {
  const dec = at("2026-12-10T12:00:00Z");
  it("off while offer-live or plus is hidden, or outside the window", () => {
    expect(offerActive(on("hidden"), dec, {})).toBe(false);
    expect(offerActive(on("live", "hidden"), dec, {})).toBe(false);
    expect(offerActive(on("live"), at("2027-01-01T00:00:00Z"), {})).toBe(false);
    expect(offerActive(on("live"), dec, {})).toBe(true);
  });
});

describe("offerEligible: no previous subscription (the ruling)", () => {
  const base = { status: "canceled", current_period_end: null, trial_started_at: null, store_subscription_id: null };
  it("no row, or a row that never had one: yes", () => {
    expect(offerEligible(null)).toBe(true);
    expect(offerEligible(base)).toBe(true);
  });
  it("a free week before, a subscription before, or Plus now: no", () => {
    expect(offerEligible({ ...base, trial_started_at: "2026-10-01T00:00:00Z" })).toBe(false);
    expect(offerEligible({ ...base, store_subscription_id: "sub_1" })).toBe(false);
    expect(offerEligible({ ...base, status: "active", current_period_end: "2099-01-01T00:00:00Z" })).toBe(false);
  });
});
