import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { POLICY_VERSIONS, REQUIRED_KINDS, type ConsentKind } from "@/lib/legalVersions";

type Client = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

// The parts of get_me() (moodbow-app migration 004) the web reads. The
// RPC is SECURITY DEFINER and only ever returns the caller's own data.
export type Me = {
  profile: { locale: string; time_zone: string; country: string | null; onboarded_at: string | null } | null;
  consents: Partial<Record<ConsentKind, { version: string; granted: boolean }>>;
  has_required_consents: boolean;
  today: string;
};

export async function getMe(supabase: Client): Promise<Me | null> {
  const { data, error } = await supabase.rpc("get_me");
  if (error || !data) return null;
  return data as Me;
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
