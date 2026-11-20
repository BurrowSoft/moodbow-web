// @vitest-environment node
import { describe, expect, it } from "vitest";
import { allowedPrices, isOurs, sellingPrice, STRIPE_APP } from "./ours";

// The account is shared with SolvyMed: Moodbow's subscriptions are the ones tagged app=moodbow AND on one of our prices.

const item = (id: string | null) => ({ price: id === null ? null : { id } });
const sub = (metadata: Record<string, string> | null, ...prices: (string | null)[]) => ({ metadata, items: { data: prices.map(item) } });

describe("allowedPrices and sellingPrice: STRIPE_PLUS_PRICE_ID, one id or several", () => {
  it("reads one, several (spaces and empty parts dropped), or none", () => {
    expect(allowedPrices("price_a")).toEqual(["price_a"]);
    expect(allowedPrices(" price_a , price_b,,")).toEqual(["price_a", "price_b"]);
    expect(allowedPrices("")).toEqual([]);
    expect(allowedPrices(" , ")).toEqual([]);
  });
  it("sells the first, and nothing without one", () => {
    expect(sellingPrice("price_a,price_b")).toBe("price_a");
    expect(sellingPrice("")).toBeNull();
  });
  it("reads the environment when given nothing", () => {
    const before = process.env.STRIPE_PLUS_PRICE_ID;
    try {
      process.env.STRIPE_PLUS_PRICE_ID = "price_env, price_old";
      expect(allowedPrices()).toEqual(["price_env", "price_old"]);
      expect(sellingPrice()).toBe("price_env");
      delete process.env.STRIPE_PLUS_PRICE_ID;
      expect(allowedPrices()).toEqual([]);
      expect(sellingPrice()).toBeNull();
    } finally {
      if (before === undefined) delete process.env.STRIPE_PLUS_PRICE_ID;
      else process.env.STRIPE_PLUS_PRICE_ID = before;
    }
  });
});

describe("isOurs: the tag AND one of our prices", () => {
  const PRICES = ["price_a", "price_b"];
  it("tagged and on a price of ours", () => {
    expect(STRIPE_APP).toBe("moodbow");
    expect(isOurs(sub({ app: "moodbow", user_id: "u1" }, "price_a"), PRICES)).toBe(true);
    expect(isOurs(sub({ app: "moodbow" }, "price_x", "price_b"), PRICES)).toBe(true);
  });
  it("anything else is SolvyMed's, or no one's", () => {
    expect(isOurs(sub({ user_id: "u1" }, "price_a"), PRICES)).toBe(false);
    expect(isOurs(sub({ app: "solvymed" }, "price_a"), PRICES)).toBe(false);
    expect(isOurs(sub({ app: "Moodbow" }, "price_a"), PRICES)).toBe(false);
    expect(isOurs(sub(null, "price_a"), PRICES)).toBe(false);
    expect(isOurs(sub({ app: "moodbow" }, "price_x"), PRICES)).toBe(false);
    expect(isOurs(sub({ app: "moodbow" }, null), PRICES)).toBe(false);
    expect(isOurs(sub({ app: "moodbow" }), PRICES)).toBe(false);
    expect(isOurs({ metadata: { app: "moodbow" }, items: null }, PRICES)).toBe(false);
    expect(isOurs(sub({ app: "moodbow" }, "price_a"), [])).toBe(false);
  });
});
