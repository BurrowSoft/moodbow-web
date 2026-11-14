import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prices = { retrieve: vi.fn() };
const coupons = { retrieve: vi.fn() };
vi.mock("./stripe", () => ({ getStripe: () => ({ prices, coupons }), stripeConfigured: () => true }));
const { clearPriceCache, currencyFor, formatPrice, readPlusPrices } = await import("./prices");

const PRICE = { currency: "usd", unit_amount: 5999, currency_options: { eur: { unit_amount: 4999 }, jpy: { unit_amount: 9599 }, gbp: { unit_amount: 4999 } } };
const COUPON = { currency: "usd", amount_off: 3000, currency_options: { eur: { amount_off: 2500 }, jpy: { amount_off: 4800 } } };
beforeEach(() => {
  vi.stubEnv("STRIPE_PLUS_PRICE_ID", "price_1");
  vi.stubEnv("STRIPE_PLUS_OFFER_COUPON_ID", "coupon_1");
  prices.retrieve.mockResolvedValue(PRICE);
  coupons.retrieve.mockResolvedValue(COUPON);
});
afterEach(() => {
  vi.unstubAllEnvs();
  clearPriceCache();
  vi.clearAllMocks();
});

describe("prices from Stripe, never typed in (the Reviewer's ruling)", () => {
  it("the person's currency from their country; the US$ fallbacks; anywhere else US$", () => {
    expect(currencyFor("FR")).toBe("eur");
    expect(currencyFor("jp")).toBe("jpy");
    for (const c of ["AR", "TR", "EG", "NG", "US", "XX", null]) expect(currencyFor(c)).toBe("usd");
  });
  it("the yearly price and the first year, from the Price's and the coupon's currency options", async () => {
    expect(await readPlusPrices("FR", "fr", true)).toEqual({ year: formatPrice(49.99, "eur", "fr"), firstYear: formatPrice(24.99, "eur", "fr") });
    expect(await readPlusPrices("JP", "en", true)).toEqual({ year: formatPrice(9599, "jpy", "en"), firstYear: formatPrice(4799, "jpy", "en") });
    expect(prices.retrieve).toHaveBeenCalledWith("price_1", { expand: ["currency_options"] });
  });
  it("no offer asked, or no coupon amount for that currency: no first-year price", async () => {
    expect((await readPlusPrices("FR", "en", false)).firstYear).toBeNull();
    expect(coupons.retrieve).not.toHaveBeenCalled();
    expect((await readPlusPrices("GB", "en", true)).firstYear).toBeNull();
  });
  it("a currency the Price doesn't have: the Price's own (US$), never a bare $", async () => {
    const p = await readPlusPrices("BR", "pt-br", true);
    expect(p.year).toContain("59,99");
    expect(p.year).not.toMatch(/(^|[^A-Za-z])\$/);
  });
  it("Stripe can't be read: the pre-launch label, and no offer", async () => {
    prices.retrieve.mockRejectedValue(new Error("down"));
    const p = await readPlusPrices("FR", "en", true);
    expect(p.firstYear).toBeNull();
    expect(p.year).toContain("59.99");
  });
});
