import { POLICY_VERSIONS, type ConsentItem } from "./legalVersions";

// Since #314 the consent boxes are on Create account itself, so nothing carries them between
// pages any more: the old mb_consent cookie is never set, only cleared when a leftover one is
// found (sign-up). The grants go in the signup metadata, where the auth trigger records them.
export const CONSENT_COOKIE = "mb_consent";

// What the Consent screen grants (the 18+ box is on Create account): the
// required three, and AI when its optional box was ticked (r1 §M3).
export function grantedAtConsent(ai = false): ConsentItem[] {
  return [...(["privacy", "terms", "health_data"] as const), ...(ai ? (["ai"] as const) : [])].map((kind) => ({ kind, version: POLICY_VERSIONS[kind], granted: true }));
}

