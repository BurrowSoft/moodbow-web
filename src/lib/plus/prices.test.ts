import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prices = { retrieve: vi.fn() };
const coupons = { retrieve: vi.fn() };
vi.mock("./stripe", () => ({ getStripe: () => ({ prices, coupons }), stripeConfigured: () => true }));
const { clearPriceCache, currencyFor, formatPrice, plusDeal, readPlusPrices, STRIPE_DEADLINE_MS } = await import("./prices");

const PRICE = { currency: "usd", unit_amount: 5999, currency_options: { eur: { unit_amount: 4999 }, jpy: { unit_amount: 9599 }, gbp: { unit_amount: 4999 } } };
const COUPON = { valid: true, duration: "once", currency: "usd", amount_off: 3000, currency_options: { eur: { amount_off: 2500 }, jpy: { amount_off: 4800 } } };
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

describe("a slow Stripe never holds a page (UX, 14 Nov)", () => {
  it("past STRIPE_DEADLINE_MS: the no-Stripe path (placeholder price, no offer), and not remembered", async () => {
    vi.useFakeTimers();
    try {
      prices.retrieve.mockReturnValueOnce(new Promise(() => {}));
      const slow = readPlusPrices("FR", "en", true);
      await vi.advanceTimersByTimeAsync(STRIPE_DEADLINE_MS);
      const p = await slow;
      expect(p.firstYear).toBeNull();
      expect(p.year).toContain("59.99");
      // The next page asks Stripe again (a timeout isn't cached), and gets the real price.
      expect(await plusDeal("FR", true)).toEqual({ currency: "eur", year: 4999, firstYear: 2499, coupon: "coupon_1" });
      expect(prices.retrieve).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("the coupon read is inside the same deadline", async () => {
    vi.useFakeTimers();
    try {
      coupons.retrieve.mockReturnValueOnce(new Promise(() => {}));
      const slow = plusDeal("FR", true);
      await vi.advanceTimersByTimeAsync(STRIPE_DEADLINE_MS);
      expect(await slow).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("under the deadline: the real deal", async () => {
    expect(STRIPE_DEADLINE_MS).toBe(8_000);
    expect(await plusDeal("FR", true)).toEqual({ currency: "eur", year: 4999, firstYear: 2499, coupon: "coupon_1" });
  });
});

describe("plusDeal: the one decision the page and the checkout share (the Reviewer, #315)", () => {
  it("the currency charged is the one shown: theirs where the Price has it, else the Price's own", async () => {
    expect(await plusDeal("FR", true)).toEqual({ currency: "eur", year: 4999, firstYear: 2499, coupon: "coupon_1" });
    clearPriceCache();
    expect(await plusDeal("BR", true)).toEqual({ currency: "usd", year: 5999, firstYear: 2999, coupon: "coupon_1" });
  });
  it("no first-year price, so no coupon, when the coupon lacks that currency", async () => {
    expect(await plusDeal("GB", true)).toEqual({ currency: "gbp", year: 4999, firstYear: null, coupon: null });
  });
  it("a coupon that isn't once-only (or isn't valid): no offer at all, or the renewal line would be untrue", async () => {
    coupons.retrieve.mockResolvedValue({ ...COUPON, duration: "forever" });
    expect((await plusDeal("FR", true))?.firstYear).toBeNull();
    clearPriceCache();
    coupons.retrieve.mockResolvedValue({ ...COUPON, duration: "repeating" });
    expect((await plusDeal("FR", true))?.coupon).toBeNull();
    clearPriceCache();
    coupons.retrieve.mockResolvedValue({ ...COUPON, valid: false });
    expect((await plusDeal("FR", true))?.firstYear).toBeNull();
  });
});
