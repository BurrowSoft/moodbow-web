// The one-time notice of a privacy change, before it applies (policy §8). The server says
// which notice is current, so it goes out with no deploy; an account that's seen it, or was
// created after it, doesn't get it. A policy version bump would stop everyone at Consent; this
// stops no one. An id starting with a date says when the change applies.
export function policyNoticeToShow(me: { policy_notice_id?: string | null; settings?: { policy_notice_seen?: string | null } | null }): string | null {
  const id = me.policy_notice_id;
  return typeof id === "string" && id !== "" && id !== me.settings?.policy_notice_seen ? id : null;
}

export function policyNoticeDate(id: string): string | null {
  const date = id.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return date && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? date : null;
}
