import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfferCoupon } from "./prices";

const prices = { retrieve: vi.fn() };
const coupons = { retrieve: vi.fn() };
vi.mock("./stripe", () => ({ getStripe: () => ({ prices, coupons }), stripeConfigured: () => true }));
const { clearPriceCache, currencyFor, firstYearUnder, formatPrice, percentDiscount, plusDeal, readPlusPrices, STRIPE_DEADLINE_MS } = await import("./prices");

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
  it("several prices of ours (STRIPE_PLUS_PRICE_ID, comma-separated): the one shown is the one sold, the first", async () => {
    vi.stubEnv("STRIPE_PLUS_PRICE_ID", " price_new , price_old");
    await readPlusPrices("FR", "fr", false);
    expect(prices.retrieve).toHaveBeenCalledTimes(1);
    expect(prices.retrieve).toHaveBeenCalledWith("price_new", { expand: ["currency_options"] });
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

// Stripe's percent coupon has no currency and no amount: percent_off only.
const PERCENT: OfferCoupon = { valid: true, duration: "once", currency: null, amount_off: null, percent_off: 50 };

describe("a percent_off coupon (UX, 20 Nov: Vitor's Christmas offer is 50 % off)", () => {
  it("50 % off in every currency the Price has, its own included; the checkout gets the same coupon", async () => {
    coupons.retrieve.mockResolvedValue(PERCENT);
    // A currency_options price, the Price's own currency, a zero-decimal currency, and one the
    // amount_off coupon had no amount for: a percentage needs none.
    expect(await plusDeal("FR", true)).toEqual({ currency: "eur", year: 4999, firstYear: 2499, coupon: "coupon_1" });
    clearPriceCache();
    expect(await plusDeal("BR", true)).toEqual({ currency: "usd", year: 5999, firstYear: 2999, coupon: "coupon_1" });
    clearPriceCache();
    expect(await plusDeal("JP", true)).toEqual({ currency: "jpy", year: 9599, firstYear: 4799, coupon: "coupon_1" });
    clearPriceCache();
    expect(await plusDeal("GB", true)).toEqual({ currency: "gbp", year: 4999, firstYear: 2499, coupon: "coupon_1" });
    clearPriceCache();
    expect(await readPlusPrices("JP", "en", true)).toEqual({ year: formatPrice(9599, "jpy", "en"), firstYear: formatPrice(4799, "jpy", "en") });
  });
  it("the exact half: the discount is rounded half up in the minor unit, so 59.99 at 50 % is 29.99, not 30.00", () => {
    expect(percentDiscount(5999, 50)).toBe(3000);
    expect(firstYearUnder(PERCENT, 5999, "usd")).toBe(2999);
    // A zero-decimal currency's minor unit is the yen or the won itself: the same rule.
    expect(firstYearUnder(PERCENT, 9599, "jpy")).toBe(4799);
    expect(firstYearUnder(PERCENT, 79999, "krw")).toBe(39999);
    // Not a half: the nearest minor unit, either way.
    expect(percentDiscount(4999, 25)).toBe(1250); // 1249.75
    expect(percentDiscount(5999, 33.33)).toBe(1999); // 1999.4667
    expect(percentDiscount(5999, 12.5)).toBe(750); // 749.875
    // Two decimals of a percent, exactly (33.33 × 100 isn't a whole number in floats).
    expect(percentDiscount(10000, 33.33)).toBe(3333);
  });
  it("ISK's amounts must end in 00 (Stripe), so a first year with part of a króna gives no offer (UX: never guess at money)", () => {
    expect(firstYearUnder(PERCENT, 739900, "isk")).toBeNull(); // 7,399 kr. → 3,699.50 kr.
    expect(firstYearUnder(PERCENT, 739800, "isk")).toBe(369900); // 7,398 kr. → 3,699 kr.
    // HUF and TWD charges may have decimals (Stripe): kept.
    expect(firstYearUnder(PERCENT, 1999900, "huf")).toBe(999950);
    expect(firstYearUnder(PERCENT, 199900, "twd")).toBe(99950);
  });
  it("the same gates as amount_off: valid, once only, and a first year between nothing and the year", () => {
    expect(firstYearUnder({ ...PERCENT, duration: "repeating" }, 5999, "usd")).toBeNull();
    expect(firstYearUnder({ ...PERCENT, duration: "forever" }, 5999, "usd")).toBeNull();
    expect(firstYearUnder({ ...PERCENT, valid: false }, 5999, "usd")).toBeNull();
    for (const p of [0, 100, 150, -10]) expect(firstYearUnder({ ...PERCENT, percent_off: p }, 5999, "usd"), String(p)).toBeNull();
    // Too small a percentage to take a whole minor unit off: no offer either.
    expect(firstYearUnder({ ...PERCENT, percent_off: 0.01 }, 99, "usd")).toBeNull();
  });
  it("a coupon claiming both kinds, or neither, is refused rather than guessed", () => {
    expect(firstYearUnder({ ...COUPON, percent_off: 50 }, 4999, "eur")).toBeNull();
    expect(firstYearUnder({ valid: true, duration: "once" }, 4999, "eur")).toBeNull();
  });
  it("amount_off coupons are read as before", () => {
    expect(firstYearUnder(COUPON, 4999, "eur")).toBe(2499);
    expect(firstYearUnder(COUPON, 5999, "usd")).toBe(2999);
    expect(firstYearUnder(COUPON, 4999, "gbp")).toBeNull();
  });
});
