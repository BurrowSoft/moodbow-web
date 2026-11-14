import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { ENTITLEMENT_COLUMNS, parseEntitlement } from "./entitlements";
import { offerActive, offerEligible } from "./offer";
import { readPlusPrices } from "./prices";
// readPlusPrices goes through plusDeal, the decision the checkout shares (the Reviewer, #315).
import { plusView, type PlusView } from "./view";

// What Me, Today and the Plus screen show about Plus: the person's view, the yearly price in their
// currency, and the Christmas offer only while it runs, for someone eligible (no previous
// subscription), and only with a first-year price Stripe actually has. null: the row couldn't be
// read, so nothing about Plus shows at all (never an offer to someone who may already pay).
export type PlusOfferPrices = { firstYear: string; price: string };
export type PlusPage = { view: PlusView; price: string; offer: PlusOfferPrices | null };

type Reader = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export async function readPlusPage(supabase: Reader, uid: string, country: string | null | undefined, locale: string): Promise<PlusPage | null> {
  try {
    const { data, error } = await supabase.from("entitlements").select(ENTITLEMENT_COLUMNS).eq("user_id", uid).maybeSingle();
    if (error) return null;
    const row = parseEntitlement(data);
    const view = plusView(row);
    const wanted = view.kind === "free" && offerActive() && offerEligible(row);
    const prices = await readPlusPrices(country, locale, wanted);
    return { view, price: prices.year, offer: wanted && prices.firstYear ? { firstYear: prices.firstYear, price: prices.year } : null };
  } catch {
    return null;
  }
}
