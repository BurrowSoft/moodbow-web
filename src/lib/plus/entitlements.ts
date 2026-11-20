// Moodbow Plus: the entitlements row (decision 246, docs/plus-entitlements.md).
// One row per person, whichever store sold Plus; written only by the server,
// each person reads their own (RLS). Pure: safe on the server and the client.

import contract from "../../../content/contracts/plus-entitlement.json";

export const PLUS_SOURCES = ["stripe", "play", "apple"] as const;
export type PlusSource = (typeof PLUS_SOURCES)[number];
export const TRIAL_DAYS = 7;

export type EntitlementRow = {
  user_id: string;
  source: PlusSource;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  // When the current billing period started (moodbow-app 041): a failed Stripe renewal's 7-day
  // grace runs from here, since Stripe opens the new period before it tries the invoice.
  current_period_start: string | null;
  trial_started_at: string | null;
  store_customer_id: string | null;
  store_subscription_id: string | null;
  store_product_id: string | null;
  // When Plus stops because the subscription won't renew, a pending cancel (moodbow-app 042, the contract's
  // cancel_at); null when it renews. Display only: hasPlus never reads it (Me's "won't renew" line).
  cancel_at?: string | null;
};

// cancel_at (042) must be on the database before this ships: the select names it.
export const ENTITLEMENT_COLUMNS = "user_id, source, status, trial_ends_at, current_period_end, current_period_start, trial_started_at, store_customer_id, store_subscription_id, store_product_id, cancel_at";

// The past_due grace, from the app's contract (content/contracts/plus-entitlement.json, vendored
// byte for byte from moodbow-app 041): 7 days, absolute, from the period's start.
export const PAST_DUE_GRACE_MS = contract.past_due_grace_seconds * 1000;

type PlusFields = Pick<EntitlementRow, "source" | "status" | "current_period_end" | "current_period_start">;

// The one rule, as has_plus() in SQL (041; the contract's rule): trialing or active inside its
// period; or a Stripe renewal that failed (past_due) less than 7 days after its period started.
// A store's past_due never grants (the store gave its own grace first); a null start never
// grants; paused, canceled and expired never grant.
export function hasPlus(row: PlusFields | null, now = Date.now()): boolean {
  if (!row) return false;
  if ((row.status === "trialing" || row.status === "active") && row.current_period_end) return new Date(row.current_period_end).getTime() > now;
  if (row.source === "stripe" && row.status === "past_due" && row.current_period_start) return now < new Date(row.current_period_start).getTime() + PAST_DUE_GRACE_MS;
  return false;
}

// Plus kept by the grace only: a failed Stripe renewal still inside its 7 days (Me says so).
export const inPaymentGrace = (row: PlusFields | null, now = Date.now()): boolean => !!row && row.status === "past_due" && hasPlus(row, now);

// The trial counter in Me ("Plus trial · {n} days left"): whole days left,
// rounded up, 1 to 7; null outside a running trial.
export function trialDaysLeft(row: (PlusFields & Pick<EntitlementRow, "trial_ends_at">) | null, now = Date.now()): number | null {
  if (!row || row.status !== "trialing" || !row.trial_ends_at || !hasPlus(row, now)) return null;
  const ms = new Date(row.trial_ends_at).getTime() - now;
  if (ms <= 0) return null;
  return Math.min(TRIAL_DAYS, Math.ceil(ms / 86_400_000));
}

// The web offers its 7 free days once per person, whichever store the trial
// was on (the stores enforce their own).
export const trialAvailable = (row: Pick<EntitlementRow, "trial_started_at"> | null): boolean => !row?.trial_started_at;

export function parseEntitlement(data: unknown): EntitlementRow | null {
  const r = data as Partial<EntitlementRow> | null;
  if (!r || typeof r.user_id !== "string" || typeof r.status !== "string" || !(PLUS_SOURCES as readonly unknown[]).includes(r.source)) return null;
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    user_id: r.user_id,
    source: r.source as PlusSource,
    status: r.status,
    trial_ends_at: s(r.trial_ends_at),
    current_period_start: s(r.current_period_start),
    current_period_end: s(r.current_period_end),
    trial_started_at: s(r.trial_started_at),
    store_customer_id: s(r.store_customer_id),
    store_subscription_id: s(r.store_subscription_id),
    store_product_id: s(r.store_product_id),
    cancel_at: s(r.cancel_at),
  };
}
