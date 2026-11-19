// The one-time notice of a privacy change, before it applies (policy §8). The server says
// which notice is current, so it goes out with no deploy, and an account sees it once, on
// Today. A policy version bump would stop everyone at Consent; this
// stops no one. An id starting with a date says when the change applies.
export function policyNoticeToShow(me: { policy_notice_id?: string | null; settings?: { policy_notice_seen?: string | null } | null }): string | null {
  const id = me.policy_notice_id;
  return typeof id === "string" && id !== "" && id !== me.settings?.policy_notice_seen ? id : null;
}

// The notice id is "YYYY-MM-DD" or "YYYY-MM-DD-<slug>" (e.g. "2026-12-01-plus"): the day the
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
