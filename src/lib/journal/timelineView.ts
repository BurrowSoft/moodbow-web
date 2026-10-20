// The Timeline's List · Calendar choice (1.1 M), kept in a first-party
// functional cookie so the server paints the chosen view first (UX, option
// 1; the privacy text names it). Only "list" or "calendar" is ever written;
// anything else, or no cookie, reads as List.

export type TimelineView = "list" | "calendar";
export const VIEW_COOKIE = "timeline-view";
// A year: a preference, not a session.
const MAX_AGE = 60 * 60 * 24 * 365;

export const parseView = (value: string | undefined): TimelineView => (value === "calendar" ? "calendar" : "list");

export function viewCookie(view: TimelineView): string {
  return `${VIEW_COOKIE}=${view}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax; Secure`;
}

export function setViewCookie(view: TimelineView) {
  document.cookie = viewCookie(view);
}
