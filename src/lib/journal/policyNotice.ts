// The one-time notice of a privacy change, before it applies (policy §8). The server says
// which notice is current, so it goes out with no deploy, and an account sees it once, on
// Today. A policy version bump would stop everyone at Consent; this
// stops no one. An id starting with a date says when the change applies.
// The web reads the v2 notice only (app_config.policy_notice_v2_id, moodbow-app migration 043: one
// field for every notice after Plus's; UX, 23 Nov, the AI notice). Plus's policy_notice_id stays for
// the installed apps' cards, and the web's Plus card is retired. A notice shows only for a slug this
// build has words for ("YYYY-MM-DD-<slug>"); any other shows nothing.
export const NOTICE_SLUGS = ["ai"] as const;
export type NoticeSlug = (typeof NOTICE_SLUGS)[number];

export function policyNoticeSlug(id: string): NoticeSlug | null {
  const m = id.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  return m && (NOTICE_SLUGS as readonly string[]).includes(m[1]) ? (m[1] as NoticeSlug) : null;
}

export function policyNoticeToShow(me: { policy_notice_v2_id?: string | null; settings?: { policy_notice_v2_seen?: string | null } | null }): { id: string; slug: NoticeSlug } | null {
  const id = me.policy_notice_v2_id;
  if (typeof id !== "string" || id === "" || id === me.settings?.policy_notice_v2_seen) return null;
  const slug = policyNoticeSlug(id);
  return slug ? { id, slug } : null;
}

// The current v2 notice as the server has it (RPC policy_notice_v2_current, anon too: /privacy/next and
// the policy's What changed date), only when it's one this build has words for; else null.
export function knownNotice(value: unknown): string | null {
  return typeof value === "string" && value !== "" && policyNoticeSlug(value) ? value : null;
}

// The notice id is "YYYY-MM-DD" or "YYYY-MM-DD-<slug>" (e.g. "2026-12-01-ai"): the day the
// change applies, read the same way as the app (#195): ^(\d{4})-(\d{2})-(\d{2})(?:-|$). A real
// calendar day only (no 2026-02-30 rolling over into March); otherwise null, and the card drops
// its date sentence.
export function policyNoticeDate(id: string): string | null {
  const m = id.match(/^(\d{4})-(\d{2})-(\d{2})(?:-|$)/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === mo - 1 && day.getUTCDate() === d ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// The web's own switch for the card and /privacy/next (policy-notice-live), on top of the server's
// notice id: both have to say yes. Off: nothing shows, whatever app_config holds.
export const POLICY_NOTICE_CONDITION = "policy-notice-live" as const;
