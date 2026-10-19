"use server";

import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { askAiConsent } from "@/lib/journal/ai";
import { getMe, hasCurrentConsent } from "@/lib/journal/me";
import { consentItem, type ConsentItem } from "@/lib/legalVersions";
import { CONSENT_COOKIE, CONSENT_COOKIE_MAX_AGE, grantedAtConsent, serializeConsent } from "@/lib/onboardingConsent";
import { isAuthOutage } from "@/lib/supabase/proxy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ConsentState = { status: "idle" } | { status: "error"; error: "required" | "age" | "generic" };

// Consent (M3). Both required boxes (Terms + Privacy, health data) must be
// ticked; the server checks again, whatever the browser sent.
// - Signed out (new account): the grants go into a short-lived cookie that
//   /sign-up turns into signup metadata (lib/onboardingConsent.ts).
// - Signed in without current consents (an older account, a new policy
//   version): record_consents now, then on to the journal. The 18+ box is
//   asked here too only when that account has no 18+ consent yet.
export async function giveConsent(_prev: ConsentState, form: FormData): Promise<ConsentState> {
  if (form.get("privacy") !== "on" || form.get("health") !== "on") return { status: "error", error: "required" };
  // The optional AI box, only where it was shown. Its grant also turns AI
  // on (the database's consent rule, migration 001), for setup and Me → AI.
  const ai = askAiConsent() && form.get("ai") === "on";
  const locale = await getLocale();
  const supabase = await createSupabaseServerClient();
  const { data, error: userError } = supabase ? await supabase.auth.getUser() : { data: { user: null }, error: null };
  const user = data.user;
  // Auth didn't answer: this is a signed-in person we can't see right now,
  // not a new account; never start the sign-up path for them.
  if (!user && isAuthOutage(userError)) return { status: "error", error: "generic" };

  if (!supabase || !user) {
    const store = await cookies();
    store.set(CONSENT_COOKIE, serializeConsent(grantedAtConsent(ai)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: CONSENT_COOKIE_MAX_AGE,
    });
    return redirect({ href: "/sign-up", locale });
  }

  const me = await getMe(supabase);
  const needsAge = !me || !hasCurrentConsent(me, "age_18");
  if (needsAge && form.get("age") !== "on") return { status: "error", error: "age" };
  const items: ConsentItem[] = [...grantedAtConsent(ai), ...(needsAge ? [consentItem("age_18")] : [])];
  const { error } = await supabase.rpc("record_consents", { p_items: items });
  if (error) return { status: "error", error: "generic" };
  return redirect({ href: "/app", locale });
}
