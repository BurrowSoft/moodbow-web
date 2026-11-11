import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { ENTITLEMENT_COLUMNS, parseEntitlement } from "./entitlements";
import { getStripe, retrieveSubscriptionOrNull, stripeConfigured } from "./stripe";

type Reader = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

// Delete account with Moodbow Plus bought on the web (UX, #270): the Stripe
// subscription is cancelled now, with no refund, before the account goes, so
// nobody is charged for an account that's gone. Never blocks the deletion: if
// Stripe or the read fails, delete_my_account still queues the subscription
// and the daily cancel cron ends it (api/cron/stripe-cancel-queue). Play and
// Apple can't be cancelled from here; the confirmation tells the person.
export async function cancelStripeBeforeDelete(supabase: Reader, uid: string): Promise<"none" | "cancelled" | "left_for_cron"> {
  try {
    const { data, error } = await supabase.from("entitlements").select(ENTITLEMENT_COLUMNS).eq("user_id", uid).maybeSingle();
    if (error) return "left_for_cron";
    const row = parseEntitlement(data);
    if (row?.source !== "stripe" || !row.store_subscription_id) return "none";
    if (!stripeConfigured()) return "left_for_cron";
    const sub = await retrieveSubscriptionOrNull(row.store_subscription_id);
    // Only this person's own subscription, and only one still running.
    if (!sub || sub.metadata?.user_id !== uid || sub.status === "canceled" || sub.status === "incomplete_expired") return "none";
    await getStripe().subscriptions.cancel(sub.id);
    return "cancelled";
  } catch {
    return "left_for_cron";
  }
}
