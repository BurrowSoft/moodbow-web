import { POLICY_VERSIONS, type ConsentItem } from "./legalVersions";

// Consent comes before Create account (M3 option A), so a signed-out visitor's
// choices are carried from /consent to /sign-up in a short-lived httpOnly
// cookie, then sent in the signup metadata, where the auth trigger records
// them. The cookie holds only kinds + versions + true/false (no personal
// data), and sign-up refuses to run without it.
export const CONSENT_COOKIE = "mb_consent";
export const CONSENT_COOKIE_MAX_AGE = 60 * 60; // 1 hour

// What the Consent screen grants (the 18+ box is on Create account).
export function grantedAtConsent(): ConsentItem[] {
  return (["privacy", "terms", "health_data"] as const).map((kind) => ({ kind, version: POLICY_VERSIONS[kind], granted: true }));
}

export function serializeConsent(items: ConsentItem[]): string {
  return JSON.stringify(items.map(({ kind, version, granted }) => ({ kind, version, granted })));
}

// The cookie must hold exactly the current required grants (privacy, terms,
// health data, current versions); anything else counts as no consent.
export function parseConsentCookie(raw: string | undefined): ConsentItem[] | null {
  if (!raw) return null;
  try {
    const items = JSON.parse(raw) as ConsentItem[];
    const expected = grantedAtConsent();
    const ok =
      Array.isArray(items) &&
      items.length === expected.length &&
      expected.every((e) => items.some((i) => i.kind === e.kind && i.version === e.version && i.granted === true));
    return ok ? expected : null;
  } catch {
    return null;
  }
}
