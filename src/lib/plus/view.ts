import { parseExtraTimes } from "@/lib/journal/extraReminders";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { ENTITLEMENT_COLUMNS, hasPlus, parseEntitlement, trialAvailable, trialDaysLeft, type EntitlementRow, type PlusSource } from "./entitlements";

// What a page shows about Moodbow Plus (decision 246), from the person's own
// entitlements row (RLS: read own only). Pure apart from readPlusView.

export type PlusView =
  // No Plus: offered with the free week (trial) or, once it was used, without.
  | { kind: "free"; trial: boolean }
  // Plus, from whichever store; daysLeft only while the free week runs.
  | { kind: "plus"; source: PlusSource; daysLeft: number | null; until?: string }
  // A Stripe renewal failed: Plus is paused until the card is fixed (a state, not a reminder).
  | { kind: "past_due" };

export function plusView(row: EntitlementRow | null, now = Date.now()): PlusView {
  if (row && hasPlus(row, now)) return { kind: "plus", source: row.source, daysLeft: trialDaysLeft(row, now), ...(row.current_period_end ? { until: row.current_period_end } : {}) };
  if (row?.source === "stripe" && row.status === "past_due") return { kind: "past_due" };
  return { kind: "free", trial: trialAvailable(row) };
}

type Reader = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

// null when the row can't be read: the page then shows nothing about Plus at
// all (never an offer to someone who may already pay).
export async function readPlusView(supabase: Reader, uid: string): Promise<PlusView | null> {
  try {
    const { data, error } = await supabase.from("entitlements").select(ENTITLEMENT_COLUMNS).eq("user_id", uid).maybeSingle();
    return error ? null : plusView(parseEntitlement(data));
  } catch {
    return null;
  }
}

// Insights' locked items (Year tab, More patterns, the Your week line): only for
// someone without Plus, and none at all on a hard week, beside the help offer
// (UX, #271). null: show nothing about Plus.
export function insightsOffer(view: PlusView | null, hardWeek: boolean, price: string): { trial: boolean; price: string } | null {
  if (!view || view.kind === "plus" || hardWeek) return null;
  return { trial: view.kind === "free" && view.trial, price };
}

// Me → Daily reminder's more reminders (specs/plus-more-reminders.md): editable with Plus;
// otherwise Add another time is the lock, and times kept from an earlier Plus show locked
// (the phone doesn't send them; nothing is deleted). null: nothing about Plus (the flag off, or
// the row unreadable), not even the kept times.
export function extraReminders(view: PlusView | null, stored: unknown, price: string): { mode: { kind: "plus" } | { kind: "locked"; offer: { trial: boolean; price: string } }; times: string[] } | null {
  if (!view) return null;
  const times = parseExtraTimes(stored);
  if (view.kind === "plus") return { mode: { kind: "plus" }, times };
  return { mode: { kind: "locked", offer: { trial: view.kind === "free" && view.trial, price } }, times };
}

// The price as the page shows it. Until the price table and Stripe's
// currency_options are read (before launch, UX: the page must show exactly
// what Checkout charges), US$59.99 in the language's own format.
export const PLUS_PRICE_USD = 59.99;
export function plusPriceLabel(locale: string): string {
  const tag = locale === "en" ? "en-GB" : locale === "pt-br" ? "pt-BR" : locale;
  const symbol = new Intl.NumberFormat(tag, { style: "currency", currency: "USD" }).format(PLUS_PRICE_USD);
  // Never a bare "$" (de: "59,99 $"): it must say which dollar before the card form.
  return symbol.includes("US") ? symbol : new Intl.NumberFormat(tag, { style: "currency", currency: "USD", currencyDisplay: "code" }).format(PLUS_PRICE_USD);
}
