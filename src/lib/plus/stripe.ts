import Stripe from "stripe";
import { ALL_LOCALES } from "@/i18n/routing";

// Moodbow Plus on the web (decision 246, docs/plus-entitlements.md), SolvyMed's
// pattern. Server only: the routes under api/checkout, api/billing,
// api/webhooks and api/cron, and Delete account.

// Built on first use, not when the module loads: Next collects route data at
// build time, and a client built then without STRIPE_SECRET_KEY (a Preview
// without the test key, CI) would fail the build. A missing key fails only
// the call that needs it, at request time.
let client: Stripe | null = null;
export function getStripe(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });
  return client;
}
export const stripeConfigured = (): boolean => Boolean(process.env.STRIPE_SECRET_KEY?.trim());

// Stripe's pages (Checkout, the Customer Portal) and its emails in the
// person's language: every route locale is one Stripe has.
const STRIPE_LOCALES: Record<(typeof ALL_LOCALES)[number], Stripe.Checkout.SessionCreateParams.Locale> = {
  en: "en",
  th: "th",
  fr: "fr",
  es: "es",
  "pt-br": "pt-BR",
  de: "de",
  it: "it",
};
export function stripeLocale(locale: string): Stripe.Checkout.SessionCreateParams.Locale {
  return STRIPE_LOCALES[locale as keyof typeof STRIPE_LOCALES] ?? "auto";
}
export const isRouteLocale = (l: unknown): l is (typeof ALL_LOCALES)[number] => (ALL_LOCALES as readonly unknown[]).includes(l);

// A subscription by id, or null when Stripe doesn't know it (resource_missing:
// e.g. a test-mode id under live keys). Treating that as a failure would lock
// the person out of checkout and the portal for good. Every other error still
// throws, so callers fail closed.
export async function retrieveSubscriptionOrNull(id: string): Promise<Stripe.Subscription | null> {
  try {
    return await getStripe().subscriptions.retrieve(id);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing") return null;
    throw err;
  }
}

export const isLive = (sub: Pick<Stripe.Subscription, "status">): boolean => sub.status === "active" || sub.status === "trialing";

// Stripe still holds this subscription and may yet collect on it (past_due,
// unpaid, incomplete, paused) but it isn't granting Plus. The fix is the card
// (the Customer Portal), never a second subscription.
export const needsCardFix = (sub: Pick<Stripe.Subscription, "status">): boolean =>
  !isLive(sub) && sub.status !== "canceled" && sub.status !== "incomplete_expired";

export type EntitlementStatus = "trialing" | "active" | "past_due" | "paused" | "canceled" | "expired";

// Stripe's status as the entitlements row keeps it (docs/plus-entitlements.md).
export function entitlementStatus(status: Stripe.Subscription.Status): EntitlementStatus {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "paused":
    case "canceled":
      return status;
    case "unpaid":
      return "past_due";
    default:
      return "expired";
  }
}
