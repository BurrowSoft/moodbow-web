"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { CONFIRM_FAILED, confirmTarget, keepsSession, parseConfirmLink, type ConfirmTarget } from "@/lib/authConfirm";
import { liveFeatures } from "@/lib/liveFeatures";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The button on /auth/confirm. Only this POST spends the token: mail
// scanners that prefetch links (Outlook Safe Links, corporate gateways) only
// GET the page, so they can't burn it. Verifies against this deployment's
// Supabase project, then redirects to a clean URL. Nothing here logs.
export async function confirmLink(form: FormData): Promise<void> {
  const params = new URLSearchParams();
  params.set("token_hash", String(form.get("token_hash") ?? ""));
  params.set("type", String(form.get("type") ?? ""));
  const link = parseConfirmLink(params);

  let target: ConfirmTarget = CONFIRM_FAILED;
  const supabase = link ? await createSupabaseServerClient() : null;
  if (link && supabase) {
    const { data, error } = await supabase.auth.verifyOtp({ type: link.type, token_hash: link.tokenHash });
    if (!error) {
      target = confirmTarget(link.type, !!data.session);
      if (!keepsSession(link.type, liveFeatures.webJournal)) await supabase.auth.signOut({ scope: "local" });
    }
  }

  const locale = await getLocale();
  redirect({ href: target.result ? { pathname: target.path, query: { result: target.result } } : target.path, locale });
}
