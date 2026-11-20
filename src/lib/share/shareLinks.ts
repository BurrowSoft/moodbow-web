// The owner's share links (1.4 G; plans/PLAN-trusted-share.md §7; moodbow-app migration 040 and its
// Today-note patch). Read through RLS with the columns 040 grants (never token_hash); every write is
// one of 040's functions.
export const SHARE_LINK_COLUMNS = "id, first_name, include_routine, routine_item_ids, created_at, created_on, expires_at, revoked_at, view_count, last_viewed_at, created_seen_at, first_view_seen_at";
export const MAX_ACTIVE_LINKS = 3;
export const EXPIRY_DAYS = [7, 30, 90] as const;
export type ExpiryDays = (typeof EXPIRY_DAYS)[number];
export const DEFAULT_EXPIRY: ExpiryDays = 30;

// The sharing consent's version, recorded on each link (consent_version, MHMDA; the plan's §2 and
// §10). The wording is Vitor's: when he changes it, this changes with it.
export const SHARE_CONSENT_VERSION = "share-2026-11-18";

export type ShareLink = {
  id: string;
  first_name: string | null;
  include_routine: boolean;
  routine_item_ids: string[];
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
  created_seen_at: string | null;
  first_view_seen_at: string | null;
};
export type LinkState = "active" | "ended" | "stopped";

const str = (v: unknown): v is string => typeof v === "string";

export function parseShareLinks(rows: unknown): ShareLink[] {
  return (Array.isArray(rows) ? rows : [])
    .filter((r): r is Record<string, unknown> => !!r && str(r.id) && str(r.created_at) && str(r.expires_at))
    .map((r) => ({
      id: r.id as string,
      first_name: str(r.first_name) && r.first_name.trim() !== "" ? r.first_name : null,
      include_routine: r.include_routine === true,
      routine_item_ids: Array.isArray(r.routine_item_ids) ? (r.routine_item_ids as unknown[]).filter(str) : [],
      created_at: r.created_at as string,
      expires_at: r.expires_at as string,
      revoked_at: str(r.revoked_at) ? r.revoked_at : null,
      view_count: typeof r.view_count === "number" && Number.isInteger(r.view_count) && r.view_count >= 0 ? r.view_count : 0,
      created_seen_at: str(r.created_seen_at) ? r.created_seen_at : null,
      first_view_seen_at: str(r.first_view_seen_at) ? r.first_view_seen_at : null,
    }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function linkState(link: ShareLink, now: Date): LinkState {
  if (link.revoked_at) return "stopped";
  return Date.parse(link.expires_at) <= now.getTime() ? "ended" : "active";
}

export const activeLinks = (links: ShareLink[], now: Date) => links.filter((l) => linkState(l, now) === "active");

// Me's always-visible line (the coercion defence): the number of active links, or null when the
// count couldn't be read. Then Me shows the row without the line, and never "0 active" (the
// Reviewer, #364): a failed read must not look like reassurance. The next visit reads again.
export function activeShareLine(read: { count: number | null; error: unknown } | null): number | null {
  if (!read || read.error || typeof read.count !== "number") return null;
  return read.count > 0 ? read.count : null;
}

// Today's notes (UX, the coercion defence): a link's creation while created_seen_at is null, and its
// first view while view_count >= 1 and first_view_seen_at is null. Shown on whichever device comes
// next, since the database keeps the "seen". The newest of each; a stopped or ended link still
// shows its note (the person should know), never more than one of each kind.
export type ShareNote = { kind: "created" | "first_view"; id: string };
export function shareNotes(links: ShareLink[]): ShareNote[] {
  const created = links.find((l) => l.created_seen_at === null);
  const firstView = links.find((l) => l.view_count >= 1 && l.first_view_seen_at === null);
  return [...(created ? [{ kind: "created" as const, id: created.id }] : []), ...(firstView ? [{ kind: "first_view" as const, id: firstView.id }] : [])];
}

// The viewer's address for a token: the page, the token in the fragment only (never sent to a server).
export const shareUrl = (origin: string, localePrefix: string, token: string) => `${origin}${localePrefix}/s#${token}`;
