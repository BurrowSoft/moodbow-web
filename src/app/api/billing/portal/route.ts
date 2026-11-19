import type Stripe from "stripe";
import { pageGate } from "@/lib/conditions";
import { pageOrigin, sameOrigin } from "@/lib/http/sameOrigin";
import { ENTITLEMENT_COLUMNS, parseEntitlement } from "@/lib/plus/entitlements";
import { getStripe, isRouteLocale, retrieveSubscriptionOrNull, stripeConfigured, stripeLocale } from "@/lib/plus/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Moodbow Plus bought on the web: Stripe's Customer Portal, to change the card
// (after a failed renewal Stripe retries, and the webhook brings Plus back) or
// cancel. Only for the person's own Stripe subscription; a failure is never
// answered with a new checkout, which would bill a second subscription.

export const dynamic = "force-dynamic";

const no = (code: string, status: number) => Response.json({ code }, { status });

export async function POST(req: Request): Promise<Response> {
  if (pageGate("plus") === "hidden") return new Response(null, { status: 404 });
  if (!sameOrigin(req)) return no("generic", 403);
  if (!stripeConfigured()) return no("not_configured", 503);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return no("generic", 503);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return no(authError?.name === "AuthRetryableFetchError" ? "generic" : "signed_out", authError?.name === "AuthRetryableFetchError" ? 503 : 401);

  const { data, error } = await supabase.from("entitlements").select(ENTITLEMENT_COLUMNS).eq("user_id", user.id).maybeSingle();
  if (error) return no("check_failed", 503);
  const row = parseEntitlement(data);
  if (row?.source !== "stripe" || !row.store_subscription_id) return no("no_subscription", 404);

  const body = (await req.json().catch(() => ({}))) as { locale?: unknown };
  const locale = isRouteLocale(body.locale) ? body.locale : "en";

  let customer: string;
  try {
    const live = await retrieveSubscriptionOrNull(row.store_subscription_id);
    // Unknown to Stripe, or not this person's: nothing to manage, and never a
    // portal for someone else's customer.
    if (!live || live.metadata?.user_id !== user.id) return no("no_subscription", 404);
    customer = typeof live.customer === "string" ? live.customer : live.customer.id;
  } catch {
    return no("check_failed", 503);
  }
  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer,
      locale: stripeLocale(locale) as Stripe.BillingPortal.SessionCreateParams.Locale,
      return_url: `${pageOrigin(req)}${locale === "en" ? "" : `/${locale}`}/app/me/plus`,
    });
    return Response.json({ url: portal.url });
  } catch {
    // Most likely the portal isn't set up in the Dashboard for this mode.
    return no("portal_unavailable", 503);
  }
}
