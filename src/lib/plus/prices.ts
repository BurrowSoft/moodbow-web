import { getStripe, stripeConfigured } from "./stripe";
import { plusPriceLabel } from "./view";

// Every price on screen comes from Stripe, in the person's currency, the renewal included (the
// Reviewer's ruling, 1.3): the yearly Price's currency_options (STRIPE_PLUS_PRICE_ID), and for the
// Christmas offer the first-year coupon's (STRIPE_PLUS_OFFER_COUPON_ID, amount_off per currency;
// the first year is the price less that). Nothing is typed in here. Without Stripe (a build with no
// keys) the yearly label falls back to the pre-launch US$ one, and there's no offer at all.

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

export type PlusPrices = { year: string; firstYear: string | null };

type Amounts = { currency: string; year: number; off: number | null };
const cache = new Map<string, { at: number; value: Amounts | null }>();
const TTL_MS = 10 * 60 * 1000;

async function amountsFor(currency: string, withOffer: boolean): Promise<Amounts | null> {
  const key = `${currency}:${withOffer}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const priceId = process.env.STRIPE_PLUS_PRICE_ID?.trim();
  if (!priceId || !stripeConfigured()) return null;
  let value: Amounts | null = null;
  try {
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(priceId, { expand: ["currency_options"] });
    // The person's currency where the Price has it, else the Price's own (US$).
    const own = price.currency_options?.[currency]?.unit_amount;
    const cur = typeof own === "number" ? currency : price.currency;
    const year = typeof own === "number" ? own : price.unit_amount;
    if (typeof year === "number") {
      let off: number | null = null;
      const couponId = process.env.STRIPE_PLUS_OFFER_COUPON_ID?.trim();
      if (withOffer && couponId) {
        const coupon = await stripe.coupons.retrieve(couponId, { expand: ["currency_options"] });
        const amount = coupon.currency_options?.[cur]?.amount_off ?? (coupon.currency === cur ? coupon.amount_off : null);
        off = typeof amount === "number" && amount > 0 && amount < year ? amount : null;
      }
      value = { currency: cur, year, off };
    }
  } catch {
    value = null;
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

// The yearly price and, during the offer for someone eligible, the first year's.
export async function readPlusPrices(country: string | null | undefined, locale: string, withOffer: boolean): Promise<PlusPrices> {
  const a = await amountsFor(currencyFor(country), withOffer);
  if (!a) return { year: plusPriceLabel(locale), firstYear: null };
  return {
    year: formatPrice(fromMinor(a.year, a.currency), a.currency, locale),
    firstYear: a.off === null ? null : formatPrice(fromMinor(a.year - a.off, a.currency), a.currency, locale),
  };
}

// Tests only.
export const clearPriceCache = () => cache.clear();
