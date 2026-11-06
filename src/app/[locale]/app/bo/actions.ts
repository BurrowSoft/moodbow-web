"use server";

import { pageGate } from "@/lib/conditions";
import { gateChanged } from "@/lib/journal/gateChanged";
import { consentItem } from "@/lib/legalVersions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The first open's yes: the AI consent, which also turns AI on (the database's rule,
// migration 001). The 18+ row is /consent's, and this never ticks or implies it. The
// function checks both again on every send.
export async function giveBoConsent(): Promise<{ ok: boolean }> {
  if (pageGate("bo-live") === "hidden") return { ok: false };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false };
  const { error } = await supabase.rpc("record_consents", { p_items: [consentItem("ai")] });
  if (error) return { ok: false };
  gateChanged();
  return { ok: true };
}
