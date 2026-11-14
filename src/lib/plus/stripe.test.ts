// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_LOCALES } from "@/i18n/routing";
import { entitlementStatus, getStripe, isLive, needsCardFix, stripeConfigured, stripeLocale } from "./stripe";

afterEach(() => vi.unstubAllEnvs());

describe("the Stripe client: built on first use", () => {
  it("importing the module needs no key (a Preview without one still builds)", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(stripeConfigured()).toBe(false);
  });
  it("one client, the same on every call", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_not_real");
    expect(stripeConfigured()).toBe(true);
    expect(getStripe()).toBe(getStripe());
  });
});

describe("stripeLocale: Stripe's pages in the person's language", () => {
  it("every route locale has its Stripe locale", () => {
    expect(ALL_LOCALES.map(stripeLocale)).toEqual(["en", "th", "fr", "es", "pt-BR", "de", "it"]);
  });
  it("anything else: the browser's (auto)", () => {
    expect(stripeLocale("xx")).toBe("auto");
    expect(stripeLocale("")).toBe("auto");
  });
});

describe("Stripe's status on the row", () => {
  it("as the design note maps it", () => {
    expect(entitlementStatus("active")).toBe("active");
    expect(entitlementStatus("trialing")).toBe("trialing");
    expect(entitlementStatus("past_due")).toBe("past_due");
    expect(entitlementStatus("unpaid")).toBe("past_due");
    expect(entitlementStatus("paused")).toBe("paused");
    expect(entitlementStatus("canceled")).toBe("canceled");
    expect(entitlementStatus("incomplete")).toBe("expired");
    expect(entitlementStatus("incomplete_expired")).toBe("expired");
  });
  it("only active and trialing are live; the card fix is for the rest that Stripe may still collect", () => {
    expect(["active", "trialing"].every((status) => isLive({ status } as never))).toBe(true);
    expect(["past_due", "unpaid", "incomplete", "paused"].every((status) => needsCardFix({ status } as never))).toBe(true);
    expect(["active", "trialing", "canceled", "incomplete_expired"].some((status) => needsCardFix({ status } as never))).toBe(false);
  });
});
