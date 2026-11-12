import * as Sentry from "@sentry/nextjs";
import { conditionMet } from "@/lib/conditions";
import { getStripe, retrieveSubscriptionOrNull, stripeConfigured } from "@/lib/plus/stripe";
import { clearCancelQueue, readCancelQueue, serviceRoleConfigured } from "@/lib/plus/serviceRole";
import { cronAuthorized } from "@/lib/plus/stripeReconcile";

// Accounts deleted in the app (UX, #270): delete_my_account leaves a live
// Stripe subscription's id in stripe_cancel_queue, and this daily cron cancels
// it, immediately and with no refund, so nobody is charged for an account
// that's gone. Deletes on the web cancel at once (Delete account); this
// catches those too if Stripe was down then. Runs whatever the plus flag
// says: once someone has paid, a deleted account must stop being charged.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) return Response.json({ error: "unauthorized" }, { status: 401 });
  // Before Plus is set up on this deployment (no key, or no table yet): a quiet
  // no-op, one log line, not a daily error (Reviewer, #270). Once Plus is on, a
  // missing key or an unreadable queue is an error.
  const quiet = (why: string) => {
    console.log(`[stripe-cancel-queue] skipped: ${why}`);
    return Response.json({ skipped: why });
  };
  if (!stripeConfigured() || !serviceRoleConfigured()) return conditionMet("plus") ? Response.json({ error: "not_configured" }, { status: 503 }) : quiet("not_configured");
  const queue = await readCancelQueue();
  if (!queue.ok) return conditionMet("plus") ? Response.json({ error: "db" }, { status: 500 }) : quiet("no_queue");

  let cancelled = 0;
  let failed = 0;
  for (const id of queue.value) {
    try {
      const sub = await retrieveSubscriptionOrNull(id);
      if (sub && sub.status !== "canceled" && sub.status !== "incomplete_expired") await getStripe().subscriptions.cancel(id);
      // Cancelled now, already, or unknown to Stripe: done either way.
      if (await clearCancelQueue(id)) cancelled++;
      else failed++;
    } catch {
      failed++; // stays queued for tomorrow
    }
  }
  if (failed > 0) Sentry.captureMessage(`Stripe cancel queue: ${failed} not cancelled`, { level: "error", fingerprint: ["stripe-cancel-queue"] });
  return Response.json({ cancelled, failed });
}
