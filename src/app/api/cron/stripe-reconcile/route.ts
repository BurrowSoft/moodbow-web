import { captureMessage } from "@sentry/nextjs";
import { pageGate } from "@/lib/conditions";
import { allowedPrices, isOurs } from "@/lib/plus/ours";
import { getStripe, stripeConfigured } from "@/lib/plus/stripe";
import { readStripeEntitlements, serviceRoleConfigured } from "@/lib/plus/serviceRole";
import { cronAuthorized, reconcile, type StripeSubLite } from "@/lib/plus/stripeReconcile";

// The daily Stripe ↔ entitlements check (vercel.json crons). Read-only on both
// sides: it lists, compares and reports (the response, one log line, and a
// Sentry message with counts when something differs). It never changes a
// subscription or a row.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (pageGate("plus") === "hidden") return Response.json({ skipped: "plus_off" });
  // Without a price of ours, nothing could be told apart from SolvyMed's (ours.ts).
  const prices = allowedPrices();
  if (!stripeConfigured() || !serviceRoleConfigured() || prices.length === 0) return Response.json({ error: "not_configured" }, { status: 503 });

  // Moodbow's only: the account is shared with SolvyMed, whose subscriptions are counted (foreign) and never listed.
  const subs: StripeSubLite[] = [];
  let foreign = 0;
  for await (const s of getStripe().subscriptions.list({ status: "all", limit: 100 })) {
    if (!isOurs(s, prices)) {
      foreign += 1;
      continue;
    }
    subs.push({ id: s.id, status: s.status, userId: (s.metadata?.user_id as string | undefined) ?? null, created: s.created });
  }
  const rows = await readStripeEntitlements();
  if (!rows.ok) return Response.json({ error: "db" }, { status: 500 });

  const mismatches = reconcile(subs, rows.value);
  const counts = { stripe: subs.length, foreign, rows: rows.value.length };
  console.log(`[stripe-reconcile] ${mismatches.length} mismatch(es); stripe=${counts.stripe} foreign=${counts.foreign} rows=${counts.rows}`);
  if (mismatches.length > 0) {
    // Counts by kind only: no account or subscription id leaves for Sentry. The
    // ids are in this run's response, for whoever runs it by hand.
    const kinds: Record<string, number> = {};
    for (const m of mismatches) kinds[m.kind] = (kinds[m.kind] ?? 0) + 1;
    captureMessage(`Stripe reconcile: ${mismatches.length} mismatch(es)`, { level: "error", fingerprint: ["stripe-reconcile"], extra: { kinds, counts } });
  }
  return Response.json({ mismatches, counts });
}
