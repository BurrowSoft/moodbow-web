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
  settings?: {
    reminder_on: boolean;
    reminder_time: string | null;
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

export async function getMe(supabase: Client): Promise<Me | null> {
  return (await readMe(supabase)).me;
}

// getMe, also saying whether get_me never answered (a data deadline), for a
// caller that handles a dropped connection itself (the check-in save).
export async function readMe(supabase: Client): Promise<{ me: Me | null; unreachable: boolean }> {
  const { data, error } = await supabase.rpc("get_me");
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
