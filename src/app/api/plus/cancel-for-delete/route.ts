import { pageGate } from "@/lib/conditions";
import { cancelStripeBeforeDelete } from "@/lib/plus/cancelOnDelete";
import { bearerUser } from "@/lib/supabase/bearer";

// Delete account in the APP with Moodbow Plus bought on the WEB (the Reviewer's payments audit,
// MAJOR, 14 Nov; option 1): the app calls this first, with the person's own access token, and the
// Stripe subscription is cancelled now (no refund), so no renewal can charge before the daily
// cancel cron would get to it. The queue (delete_my_account → api/cron/stripe-cancel-queue) stays
// the fallback. cancelStripeBeforeDelete touches only the caller's own subscription (the
// subscription's metadata.user_id must be theirs) and treats an already cancelled one as nothing
// to do, so calling again is safe.
//
// Contract (for the app):
//   POST /api/plus/cancel-for-delete   Authorization: Bearer <the user's access token>   (no body)
//   200 { status: "cancelled" }      their running web subscription was cancelled now
//   200 { status: "none" }           nothing running on the web to cancel (none, Play/Apple, already cancelled)
//   202 { status: "left_for_cron" }  Stripe or the read failed: the delete still queues it, the cron ends it
//   401 { code: "signed_out" }       no token, or not a valid one
//   503 { code: "generic" }          Auth unreachable, or the web isn't configured; the delete may go on
//   404                              Plus is off on this deployment
// Whatever it answers, the app goes on with the delete: this never blocks it.

export const dynamic = "force-dynamic";

const no = (code: string, status: number) => Response.json({ code }, { status });

export async function POST(req: Request): Promise<Response> {
  if (pageGate("plus") === "hidden") return new Response(null, { status: 404 });
  const who = await bearerUser(req);
  if (who.kind === "missing" || who.kind === "invalid") return no("signed_out", 401);
  if (who.kind !== "ok") return no("generic", 503);
  const status = await cancelStripeBeforeDelete(who.client as unknown as Parameters<typeof cancelStripeBeforeDelete>[0], who.uid);
  return Response.json({ status }, { status: status === "left_for_cron" ? 202 : 200 });
}
