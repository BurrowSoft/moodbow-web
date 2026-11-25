import { POLICY_VERSIONS, type ConsentItem } from "./legalVersions";

// Since #314 the consent boxes are on Create account itself, so nothing carries them between
// pages any more: the old mb_consent cookie is never set, only cleared when a leftover one is
// found (sign-up). The grants go in the signup metadata, where the auth trigger records them.
export const CONSENT_COOKIE = "mb_consent";

// What the Consent screen grants (the 18+ box is on Create account): the
// required three. Never AI: it's asked only in Me → AI, on its own sheet,
// where AI is actually available (UX, 23 Nov, the AI go-live, as the app).
export function grantedAtConsent(): ConsentItem[] {
  return (["privacy", "terms", "health_data"] as const).map((kind) => ({ kind, version: POLICY_VERSIONS[kind], granted: true }));
}

