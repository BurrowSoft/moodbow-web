// The policy versions this web build asks people to accept. Each must exist
// in the database's policy_versions table (moodbow-app migration 001+): a
// bump ships the accepting migration FIRST, then this constant (both
// clients send their own versions; the DB keeps every earlier one).
export const POLICY_VERSIONS = {
  privacy: "2026-10-02",
  terms: "2026-10-02",
  health_data: "2026-10-02",
  age_18: "1",
  ai: "2026-10-02",
} as const;

export type ConsentKind = keyof typeof POLICY_VERSIONS;
export type ConsentItem = { kind: ConsentKind; version: string; granted: boolean; locale?: string };

// Required before any journal write (the DB's consent_required): privacy,
// terms, 18+ and health data. AI is optional and separate.
export const REQUIRED_KINDS = ["privacy", "terms", "age_18", "health_data"] as const satisfies readonly ConsentKind[];

export function consentItem(kind: ConsentKind, granted = true): ConsentItem {
  return { kind, version: POLICY_VERSIONS[kind], granted };
}

// The language someone consented in: the UI's, on every kind, as stored (dataLocale, so "pt" for
// /pt-br), on both clients (decision 224, UX). The decisions log has the date Spanish went live,
// so "es" before it means they read the legal pages in English. The database keeps it in
// consents.locale (moodbow-app 020's _record_consent_items reads item ->> 'locale').
export const withLanguage = (items: ConsentItem[], language: string): ConsentItem[] => items.map((item) => ({ ...item, locale: language }));

// The operator notice above the consent boxes (Consent and Create account) is small print (Vitor,
// 19 Nov, as the app's small muted text): 0.6875rem, the floor, in rem so it still grows with
// browser zoom and text size; the muted token keeps AA in both themes.
export const CONSENT_NOTICE_CLASS = "text-[0.6875rem] leading-[1.35] text-muted [overflow-wrap:anywhere]";
