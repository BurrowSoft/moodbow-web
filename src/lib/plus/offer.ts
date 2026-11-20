import { pageGate, type ConditionId, type PageGate } from "@/lib/conditions";
import { hasPlus, type EntitlementRow } from "./entitlements";

// The Christmas special offer (specs/1.3-offer-review-voice-taps.md §1, "Christmas look and copy"
// and the Reviewer's rulings, 14 Nov): the first year at a lower price, from 1 December to
// 1 January 00:00 UTC on the server's clock (the same moment as Apple's and Play's), then the
// yearly price. It replaces the free week while it runs. No "was" price, no countdown, no "% off".

export type OfferEnv = { vercelEnv?: string; offerPreview?: string };
const buildEnv = (): OfferEnv => ({ vercelEnv: process.env.VERCEL_ENV, offerPreview: process.env.OFFER_PREVIEW });

// December 2026, UTC: the dates the Terms promise (1 December 2026 to 1 January 2027 00:00 UTC). Another
// December is a new offer, with its own terms and Vitor's word, so it never reopens by itself (the Reviewer,
// 20 Nov). OFFER_PREVIEW=1 opens it on a Preview deployment only, for the testers; Production (and every
// other build) ignores it.
export const OFFER_YEAR = 2026;
export function offerWindowOpen(now: number = Date.now(), env: OfferEnv = buildEnv()): boolean {
  const d = new Date(now);
  if (d.getUTCFullYear() === OFFER_YEAR && d.getUTCMonth() === 11) return true;
  return env.vercelEnv === "preview" && env.offerPreview === "1";
}

// Its own switch (offer-live), only with Plus itself on, and only inside the window.
export function offerActive(gate: (id: ConditionId) => PageGate = pageGate, now: number = Date.now(), env: OfferEnv = buildEnv()): boolean {
  return gate("offer-live") !== "hidden" && gate("plus") !== "hidden" && offerWindowOpen(now, env);
}

// Who it's for (the ruling: "the server checks there's no previous subscription"): no Plus now, and
// never a subscription or a free week before, on any store. A row that can't be read never gets here.
export function offerEligible(row: Pick<EntitlementRow, "source" | "status" | "current_period_end" | "current_period_start" | "trial_started_at" | "store_subscription_id"> | null, now: number = Date.now()): boolean {
  if (!row) return true;
  return !hasPlus(row, now) && !row.trial_started_at && !row.store_subscription_id;
}
