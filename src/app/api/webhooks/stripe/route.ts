import { captureMessage } from "@sentry/nextjs";
import type Stripe from "stripe";
import { getStripe, retrieveSubscriptionOrNull, stripeConfigured } from "@/lib/plus/stripe";
import { insertEntitlement, readEntitlement, serviceRoleConfigured, updateEntitlement } from "@/lib/plus/serviceRole";
import { subscriptionIdOf, syncSubscription, type SyncOutcome } from "@/lib/plus/stripeSync";

// Stripe → the entitlements row (Moodbow Plus, decision 246). Vitor makes the
// endpoint in the Stripe Dashboard for checkout.session.completed,
// customer.subscription.created/updated/deleted and invoice.payment_failed;
// STRIPE_WEBHOOK_SECRET is its signing secret. Every event only names a
// subscription: what's written is that subscription's live state
// (lib/plus/stripeSync.ts). A 5xx makes Stripe retry; each one is reported to
// Sentry with the event's type and id only, never its payload. It runs
// whatever the plus flag says (Reviewer, #270): once someone has paid,
// cancellations and failed renewals must keep syncing even if Plus is
// switched off. The signature is the gate.

export const dynamic = "force-dynamic";

function report(reason: string, event?: { id: string; type: string }) {
  captureMessage(`Stripe webhook: ${reason}`, {
    level: "error",
    fingerprint: ["stripe-webhook", reason],
    tags: { stripe_webhook_failure: reason, ...(event ? { stripe_event_type: event.type, stripe_event_id: event.id } : {}) },
  });
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !stripeConfigured() || !serviceRoleConfigured()) {
    report("not_configured");
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "no_signature" }, { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    report("bad_signature");
    return Response.json({ error: "bad_signature" }, { status: 400 });
  }

  const subId = subscriptionIdOf(event);
  if (!subId) return Response.json({ ok: true });
  let outcome: SyncOutcome;
  try {
    outcome = await syncSubscription(subId, {
      retrieve: retrieveSubscriptionOrNull,
      read: readEntitlement,
      insert: insertEntitlement,
      update: updateEntitlement,
    });
  } catch {
    report("handler_threw", event);
    return Response.json({ error: "failed" }, { status: 500 });
  }
  if (outcome.kind === "retry") {
    report(`sync_${outcome.reason}`, event);
    return Response.json({ error: outcome.reason }, { status: 500 });
  }
  // A subscription with no person, or Plus from another store that still
  // grants: retrying can't change it, so it's reported, not retried.
  if (outcome.kind === "skipped" && (outcome.reason === "no_user" || outcome.reason === "other_store_grants")) report(outcome.reason, event);
  return Response.json({ ok: true });
}
