import { getStripe, stripeConfigured } from "./stripe";
import { plusPriceLabel } from "./view";
import { TimedOut, withTimeout } from "@/lib/ui/withTimeout";

// How long a page waits for Stripe's price reads (UX, 14 Nov): past it, the no-Stripe path (the
// placeholder price, no offer), so a slow Stripe never holds Today's check-in. Not cached: the next
// page asks again.
export const STRIPE_DEADLINE_MS = 8_000;

// Every price on screen comes from Stripe, in the person's currency, the renewal included (the
// Reviewer's ruling, 1.3): the yearly Price's currency_options (STRIPE_PLUS_PRICE_ID), and for the
// Christmas offer the first-year coupon's (STRIPE_PLUS_OFFER_COUPON_ID, amount_off per currency,
// duration "once"; the first year is the price less that). Nothing is typed in here.
// plusDeal is the ONE decision the page and the checkout share (the Reviewer, #315): the currency
// shown is the currency charged, and the offer shows exactly when the checkout applies it.

// The person's currency from their saved country (store/plus-prices.md's 40 rows). Argentina,
// Turkey, Egypt and Nigeria pay in US$ (the USD fallbacks there); anywhere else not listed too.
const EUR = ["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES", "AD", "MC", "SM", "VA", "ME", "XK"];
const BY_COUNTRY: Record<string, string> = {
  ...Object.fromEntries(EUR.map((c) => [c, "eur"])),
  GB: "gbp", CH: "chf", LI: "chf", SE: "sek", NO: "nok", DK: "dkk", PL: "pln", CZ: "czk", HU: "huf", RO: "ron", IS: "isk",
  BR: "brl", MX: "mxn", CL: "clp", CO: "cop", PE: "pen", CA: "cad", AU: "aud", NZ: "nzd", JP: "jpy", KR: "krw", CN: "cny",
  HK: "hkd", TW: "twd", SG: "sgd", MY: "myr", TH: "thb", ID: "idr", PH: "php", VN: "vnd", IN: "inr", PK: "pkr", IL: "ils",
  AE: "aed", SA: "sar", ZA: "zar",
};
export const currencyFor = (country: string | null | undefined): string => BY_COUNTRY[(country ?? "").toUpperCase()] ?? "usd";

// Stripe's zero-decimal currencies among ours: amounts are whole units, not cents.
const ZERO_DECIMAL = new Set(["jpy", "krw", "vnd", "clp"]);
export const fromMinor = (amount: number, currency: string): number => (ZERO_DECIMAL.has(currency) ? amount : amount / 100);

// In the page's language; never a bare "$" (which dollar must be clear before the card form).
export function formatPrice(value: number, currency: string, locale: string): string {
  const tag = locale === "en" ? "en-GB" : locale === "pt-br" ? "pt-BR" : locale;
  const digits = Number.isInteger(value) ? 0 : 2;
  const fmt = (display: "symbol" | "code") =>
    new Intl.NumberFormat(tag, { style: "currency", currency: currency.toUpperCase(), currencyDisplay: display, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const symbol = fmt("symbol");
  return /(^|[^A-Za-z])\$/.test(symbol) ? fmt("code") : symbol;
}

// The deal for one person: the currency (theirs where the Price has it, else the Price's own), the
// yearly amount, and the first year's only when the offer is wanted AND the coupon has an amount
// for that very currency AND it applies once (a "forever" or "repeating" coupon would make "Then
// {price} a year" untrue: no offer then). In minor units. null: Stripe isn't there or can't be read.
export type PlusDeal = { currency: string; year: number; firstYear: number | null; coupon: string | null };

const cache = new Map<string, { at: number; value: PlusDeal | null }>();
const TTL_MS = 10 * 60 * 1000;

export async function plusDeal(country: string | null | undefined, withOffer: boolean): Promise<PlusDeal | null> {
  const wanted = currencyFor(country);
  const key = `${wanted}:${withOffer}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const priceId = process.env.STRIPE_PLUS_PRICE_ID?.trim();
  if (!priceId || !stripeConfigured()) return null;
  let value: PlusDeal | null;
  try {
    value = await withTimeout(readDeal(priceId, wanted, withOffer), STRIPE_DEADLINE_MS);
  } catch (error) {
    // Too slow: the no-Stripe path now, not remembered. Stripe said no: remembered for the TTL.
    if (error instanceof TimedOut) return null;
    value = null;
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

// Stripe's two reads (the Price, then the coupon when the offer is wanted). Throws when Stripe does.
async function readDeal(priceId: string, wanted: string, withOffer: boolean): Promise<PlusDeal | null> {
  const stripe = getStripe();
  const price = await stripe.prices.retrieve(priceId, { expand: ["currency_options"] });
  const own = price.currency_options?.[wanted]?.unit_amount;
  const currency = typeof own === "number" ? wanted : price.currency;
  const year = typeof own === "number" ? own : price.unit_amount;
  if (typeof year !== "number") return null;
  let firstYear: number | null = null;
  const couponId = process.env.STRIPE_PLUS_OFFER_COUPON_ID?.trim() || null;
  if (withOffer && couponId) {
    const coupon = await stripe.coupons.retrieve(couponId, { expand: ["currency_options"] });
    const off = coupon.currency_options?.[currency]?.amount_off ?? (coupon.currency === currency ? coupon.amount_off : null);
    if (coupon.valid && coupon.duration === "once" && typeof off === "number" && off > 0 && off < year) firstYear = year - off;
  }
  return { currency, year, firstYear, coupon: firstYear === null ? null : couponId };
}

export type PlusPrices = { year: string; firstYear: string | null };

// The yearly price and, when the deal has one, the first year's, formatted for the page.
export async function readPlusPrices(country: string | null | undefined, locale: string, withOffer: boolean): Promise<PlusPrices> {
  const d = await plusDeal(country, withOffer);
  if (!d) return { year: plusPriceLabel(locale), firstYear: null };
  return {
    year: formatPrice(fromMinor(d.year, d.currency), d.currency, locale),
    firstYear: d.firstYear === null ? null : formatPrice(fromMinor(d.firstYear, d.currency), d.currency, locale),
  };
}

// Tests only.
export const clearPriceCache = () => cache.clear();
