// Cookie-free visit counts (Vercel Web Analytics, decision 79), on the
// website and web journal only, behind the "web-analytics" condition: the
// privacy policy's {pending:web_analytics} lines and the collection go live
// together. Only the page address is sent, and it's scrubbed first (UX +
// reviewer): no query string or fragment (auth links carry tokens), entry
// ids and dates become [id] / [date], and nothing at all is sent for the
// auth pages. Never any diary content or user id.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Long opaque segments (tokens, hashes) are never page names.
const OPAQUE = /^[A-Za-z0-9_-]{20,}$/;

export function scrubUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  // /auth/* (email links, password reset), with or without a locale prefix.
  if (segments.slice(0, 2).includes("auth")) return null;
  const path = segments.map((s) => (UUID.test(s) ? "[id]" : ISO_DATE.test(s) ? "[date]" : OPAQUE.test(s) ? "[token]" : s)).join("/");
  return `${url.origin}/${path}`;
}

export function scrubEvent<T extends { url: string }>(event: T): T | null {
  const url = scrubUrl(event.url);
  return url === null ? null : { ...event, url };
}
