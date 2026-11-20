import type Stripe from "stripe";

// Moodbow shares BurrowSoft's Stripe account with SolvyMed (Vitor, 20 Nov): every webhook event, every subscription
// listed or read, may be SolvyMed's. Ours carry metadata.app = "moodbow" (set at checkout, on the subscription and
// the Checkout Session) and one of our prices. Anything else is left alone: no write, no retry, no report.

export const STRIPE_APP = "moodbow";

// Our prices: STRIPE_PLUS_PRICE_ID, one price id or several, comma-separated (later currencies or prices, UX).
export function allowedPrices(raw: string | undefined = process.env.STRIPE_PLUS_PRICE_ID): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// The price checkout sells and shows: the first of them.
export const sellingPrice = (raw?: string): string | null => allowedPrices(raw)[0] ?? null;

type SubLike = { metadata?: Stripe.Metadata | null; items?: { data?: { price?: { id?: string } | null }[] } | null };

// Tagged as Moodbow's AND sold at one of our prices: the tag alone could be copied, a price alone could be shared.
export function isOurs(sub: SubLike, prices: readonly string[]): boolean {
  if (sub.metadata?.app !== STRIPE_APP) return false;
  return (sub.items?.data ?? []).some((item) => !!item.price?.id && prices.includes(item.price.id));
}
