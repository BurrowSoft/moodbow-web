import { cache } from "react";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDeadlineError } from "@/lib/supabase/deadline";
import { POLICY_VERSIONS, REQUIRED_KINDS, type ConsentKind } from "@/lib/legalVersions";

type Client = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

// The parts of get_me() (moodbow-app migration 004) the web reads. The
// RPC is SECURITY DEFINER and only ever returns the caller's own data.
export type Me = {
  profile: { locale: string; time_zone: string; country: string | null; onboarded_at: string | null } | null;
  consents: Partial<Record<ConsentKind, { version: string; granted: boolean }>>;
  has_required_consents: boolean;
  today: string;
  // user_settings (migration 001); reminder_time is "HH:MM:SS".
  // The current privacy notice, from the server's config; null when there isn't one.
  policy_notice_id?: string | null;
  settings?: {
    bo_off?: boolean;
    policy_notice_seen?: string | null;
    reminder_on: boolean;
    reminder_time: string | null;
    // Plus: more daily reminders, "HH:MM:SS" each (migration 031); absent before it.
    extra_reminder_times?: string[];
    tone?: string;
    focus_areas?: string[];
    ai_enabled?: boolean;
  } | null;
  // get_my_credits() (migrations 003/006): the AI credit balance and Lite.
  credits?: {
    balance: number;
    tier_now?: "full" | "lite";
    lite_replies_left_estimate?: number | null;
  } | null;
  // The global AI switch (app_config.ai_enabled_global, migration 006).
  ai_available?: boolean;
};

// Once per request render for the shared client (React's cache): the journal's layout and its page
// both read it, and each read was a round trip (the Web Dev's LCP read, 12 Nov). readMe isn't
// cached: the check-in save asks it fresh.
export const getMe = cache(async (supabase: Client): Promise<Me | null> => (await readMe(supabase)).me);

// get_me says AI is available only to a build that says it can show AI (moodbow-app 044, run sheet C1b):
// ai_available is the global switch AND p_client_ai >= 1, so a call without it (every released app build)
// gets false. This build passes it on every read. Before 044 is on a server, or after a rollback, there's no
// get_me(p_client_ai) and PostgREST answers PGRST202: then once without it, as the app does, so nobody is
// locked out whatever the release order.
export const GET_ME_ARGS = { p_client_ai: 1 } as const;
const NO_SUCH_FUNCTION = "PGRST202";

// getMe, also saying whether get_me never answered (a data deadline), for a
// caller that handles a dropped connection itself (the check-in save).
export async function readMe(supabase: Client): Promise<{ me: Me | null; unreachable: boolean }> {
  let { data, error } = await supabase.rpc("get_me", GET_ME_ARGS);
  if ((error as { code?: string } | null)?.code === NO_SUCH_FUNCTION) ({ data, error } = await supabase.rpc("get_me"));
  if (error || !data) return { me: null, unreachable: isDeadlineError(error) };
  return { me: data as Me, unreachable: false };
}

// Where a signed-in person belongs before the journal (M3: anyone without
// current consents goes to Consent first; then Set up until onboarded).
export type OnboardingStep = "consent" | "setup" | "journal";

// The web checks the versions ITSELF: get_me().has_required_consents accepts
// any published version (so older app builds keep working), but this build
// asks for the versions it ships (POLICY_VERSIONS), like the app does.
export function hasCurrentConsent(me: Pick<Me, "consents">, kind: ConsentKind): boolean {
  const c = me.consents?.[kind];
  return !!c?.granted && c.version === POLICY_VERSIONS[kind];
}

export function hasCurrentConsents(me: Pick<Me, "consents">): boolean {
  return REQUIRED_KINDS.every((kind) => hasCurrentConsent(me, kind));
}

export function onboardingStep(me: Pick<Me, "consents" | "profile">): OnboardingStep {
  if (!hasCurrentConsents(me)) return "consent";
  if (!me.profile?.onboarded_at) return "setup";
  return "journal";
}
