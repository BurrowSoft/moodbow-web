// Moodbow Plus: the entitlements row (decision 246, docs/plus-entitlements.md).
// One row per person, whichever store sold Plus; written only by the server,
// each person reads their own (RLS). Pure: safe on the server and the client.

export const PLUS_SOURCES = ["stripe", "play", "apple"] as const;
export type PlusSource = (typeof PLUS_SOURCES)[number];
export const TRIAL_DAYS = 7;

export type EntitlementRow = {
  user_id: string;
  source: PlusSource;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  trial_started_at: string | null;
  store_customer_id: string | null;
  store_subscription_id: string | null;
  store_product_id: string | null;
};

export const ENTITLEMENT_COLUMNS = "user_id, source, status, trial_ends_at, current_period_end, trial_started_at, store_customer_id, store_subscription_id, store_product_id";

// The one rule, as has_plus() in SQL: trialing or active, inside its period.
// past_due, paused, canceled and expired never grant.
export function hasPlus(row: Pick<EntitlementRow, "status" | "current_period_end"> | null, now = Date.now()): boolean {
  if (!row || (row.status !== "trialing" && row.status !== "active") || !row.current_period_end) return false;
  return new Date(row.current_period_end).getTime() > now;
}

// The trial counter in Me ("Plus trial · {n} days left"): whole days left,
// rounded up, 1 to 7; null outside a running trial.
export function trialDaysLeft(row: Pick<EntitlementRow, "status" | "trial_ends_at" | "current_period_end"> | null, now = Date.now()): number | null {
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
    current_period_end: s(r.current_period_end),
    trial_started_at: s(r.trial_started_at),
    store_customer_id: s(r.store_customer_id),
    store_subscription_id: s(r.store_subscription_id),
    store_product_id: s(r.store_product_id),
  };
}
