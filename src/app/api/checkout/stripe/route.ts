import type Stripe from "stripe";
import { pageGate } from "@/lib/conditions";
import { pageOrigin, sameOrigin } from "@/lib/http/sameOrigin";
import { ENTITLEMENT_COLUMNS, hasPlus, parseEntitlement, TRIAL_DAYS, trialAvailable } from "@/lib/plus/entitlements";
import { offerActive, offerEligible } from "@/lib/plus/offer";
import { plusDeal } from "@/lib/plus/prices";
import { getStripe, isLive, isRouteLocale, needsCardFix, retrieveSubscriptionOrNull, stripeConfigured, stripeLocale } from "@/lib/plus/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// "Start my 7-day free trial" (Moodbow Plus, decision 246): a Stripe Checkout
// for the one yearly price, STRIPE_PLUS_PRICE_ID, which Vitor makes in the
// Dashboard with its currency_options. The web never sends an amount. Seven
// free days, once per person, then the yearly charge automatically, unless
// cancelled first; Stripe's own page confirms the terms. Answers { url } to go
// to, or { code } for the page's message. Every check fails closed: a lookup
// that errors is never read as "no subscription", or someone already paying
// could start a second one.

export const dynamic = "force-dynamic";

const no = (code: string, status: number) => Response.json({ code }, { status });

export async function POST(req: Request): Promise<Response> {
  if (pageGate("plus") === "hidden") return new Response(null, { status: 404 });
  if (!sameOrigin(req)) return no("generic", 403);
  const price = process.env.STRIPE_PLUS_PRICE_ID?.trim();
  if (!price || !stripeConfigured()) return no("not_configured", 503);

  const supabase = await createSupabaseServerClient();
  if (!supabase) return no("generic", 503);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return no(authError?.name === "AuthRetryableFetchError" ? "generic" : "signed_out", authError?.name === "AuthRetryableFetchError" ? 503 : 401);
  // Receipts and the renewal need an address; an account without an email adds one first.
  if (!user.email) return no("needs_email", 409);

  const body = (await req.json().catch(() => ({}))) as { locale?: unknown };
  const locale = isRouteLocale(body.locale) ? body.locale : "en";

  // The person's own row (RLS: read own only).
  const { data, error } = await supabase.from("entitlements").select(ENTITLEMENT_COLUMNS).eq("user_id", user.id).maybeSingle();
  if (error) return no("check_failed", 503);
  const row = parseEntitlement(data);
  if (hasPlus(row)) return no("already_plus", 409);

  const stripe = getStripe();
  // When a Stripe subscription is stored, Stripe decides, not the row (it
  // lags until the webhook lands). Only a dead or unknown one may be replaced.
  if (row?.source === "stripe" && row.store_subscription_id) {
    try {
      const stored = await retrieveSubscriptionOrNull(row.store_subscription_id);
      if (stored && isLive(stored)) return no("already_plus", 409);
      if (stored && needsCardFix(stored)) return no("payment_failed", 409);
    } catch {
      return no("check_failed", 503);
    }
  }

  // Between a finished checkout and its webhook (seconds, or hours while
  // deliveries fail) the row still says nothing: ask Stripe for this person's
  // recent finished checkouts whose subscription is live.
  try {
    for await (const done of stripe.checkout.sessions.list({
      status: "complete",
      created: { gte: Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60 },
      customer_details: { email: user.email },
      limit: 100,
    })) {
      if (done.client_reference_id !== user.id || !done.subscription) continue;
      const live = await retrieveSubscriptionOrNull(typeof done.subscription === "string" ? done.subscription : done.subscription.id);
      if (live && isLive(live)) return no("already_plus", 409);
    }
  } catch {
    return no("check_failed", 503);
  }

  // The same deal the page showed (plusDeal, the Reviewer #315): the currency from the saved country
  // (the one shown is the one charged), and the Christmas offer (1.3) only when the page could show
  // it: running, eligible, and the coupon has a once-only amount in that currency. Then the coupon
  // instead of the free week (one introductory offer at a time); otherwise exactly as shown.
  const { data: profile, error: profileError } = await supabase.from("profiles").select("country").eq("user_id", user.id).maybeSingle();
  if (profileError) return no("check_failed", 503);
  const deal = await plusDeal((profile as { country?: string | null } | null)?.country ?? null, offerActive() && offerEligible(row));
  if (!deal) return no("check_failed", 503);
  const offer = deal.firstYear !== null && deal.coupon !== null;
  const coupon = offer ? deal.coupon : null;
  const trial = !offer && trialAvailable(row);
  // Concurrent duplicates (a double tap, a retry) collapse into one session
  // within a 10-minute window. Everything in the key changes the parameters,
  // since Stripe refuses a reused key with different ones.
  const WINDOW_MS = 10 * 60 * 1000;
  const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const key = `plus-checkout-${user.id}-${locale}-${deal.currency}-${offer ? "offer" : trial ? "trial" : "paid"}-${windowStart / WINDOW_MS}`;
  const expiresAt = Math.floor(windowStart / 1000) + 70 * 60; // 60–70 min from now, inside Stripe's 30 min–24 h

  // At most one payable session per person: expire any other still open (an
  // abandoned tab, a language switch), or both could be completed.
  const ownKey = (k: string | undefined) => k === key || !!k?.startsWith(`${key}-r`);
  try {
    // By customer when it's known (Reviewer, #270), so it doesn't list everyone's.
    for await (const open of stripe.checkout.sessions.list({ status: "open", limit: 100, ...(row?.store_customer_id ? { customer: row.store_customer_id } : {}) })) {
      if (open.client_reference_id === user.id && !ownKey(open.metadata?.checkout_key)) await stripe.checkout.sessions.expire(open.id);
    }
  } catch {
    return no("check_failed", 503);
  }

  const back = `${pageOrigin(req)}${locale === "en" ? "" : `/${locale}`}/app/me/plus`;
  const create = (k: string) =>
    stripe.checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        // The currency the page showed (the Price's currency_options has it), never Stripe's guess from the IP.
        currency: deal.currency,
        // The card is taken now so the trial can turn into the yearly charge;
        // without one at the end, the subscription cancels instead.
        payment_method_collection: "always",
        subscription_data: {
          // The webhook gets the Subscription, not the Session: its metadata
          // is how it finds the person.
          metadata: { user_id: user.id },
          ...(trial ? { trial_period_days: TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: "cancel" } } } : {}),
        },
        ...(coupon ? { discounts: [{ coupon }] } : {}),
        metadata: { user_id: user.id, checkout_key: k, locale, ...(offer ? { offer: "christmas" } : {}) },
        client_reference_id: user.id,
        ...(row?.store_customer_id ? { customer: row.store_customer_id } : { customer_email: user.email }),
        locale: stripeLocale(locale),
        success_url: `${back}?started=1`,
        cancel_url: back,
        expires_at: expiresAt,
      } satisfies Stripe.Checkout.SessionCreateParams,
      { idempotencyKey: k },
    );

  // A key can replay a session that has since been expired (en, then es,
  // then en again in one window): re-read it, and walk a fixed sequence of
  // keys until one is open, so concurrent taps still collapse into one.
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const k = attempt === 0 ? key : `${key}-r${attempt}`;
      const created = await create(k);
      const current = await stripe.checkout.sessions.retrieve(created.id);
      if (current.status === "open" && current.url) return Response.json({ url: current.url });
    }
    return no("checkout_failed", 500);
  } catch {
    return no("checkout_failed", 500);
  }
}
