import { getLocale } from "next-intl/server";
import { dataLocale } from "@/i18n/routing";
import { consentItem, withLanguage } from "@/lib/legalVersions";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type Client = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

// The AI consent's one writer (UX, 23 Nov, the AI go-live): the consent at this build's version, then AI on in
// settings. Not a server action (this module has no server-action directive), so no browser can call it; each of its two callers checks
// its own gate first (ai.test.ts pins them by name):
// - Me → AI's sheet: me/actions.ts setAiEnabled, with aiShown read again and the sheet's confirm at this version;
// - Bo's first-open yes: bo/actions.ts giveBoConsent, behind bo-live (Bo's own gate, off on Production). Bo's own
//   switches, not the journal's AI switch, decide whether Bo runs, so its yes doesn't wait on that switch. Before
//   bo-live flips, Bo's consent screen meets the sheet's bar (the Reviewer, 23 Nov).
// Which step failed, with the database's message; null when both went through.
export async function recordAiConsentAndTurnOn(supabase: Client): Promise<{ step: "consent" | "setting"; message: string } | null> {
  const consent = await supabase.rpc("record_consents", { p_items: withLanguage([consentItem("ai", true)], dataLocale(await getLocale())) });
  if (consent.error) return { step: "consent", message: consent.error.message };
  const setting = await supabase.rpc("update_settings", { p_ai_enabled: true });
  if (setting.error) return { step: "setting", message: setting.error.message };
  return null;
}
