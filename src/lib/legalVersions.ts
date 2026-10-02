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
export type ConsentItem = { kind: ConsentKind; version: string; granted: boolean };

// Required before any journal write (the DB's consent_required): privacy,
// terms, 18+ and health data. AI is optional and separate.
export const REQUIRED_KINDS = ["privacy", "terms", "age_18", "health_data"] as const satisfies readonly ConsentKind[];

export function consentItem(kind: ConsentKind, granted = true): ConsentItem {
  return { kind, version: POLICY_VERSIONS[kind], granted };
}
