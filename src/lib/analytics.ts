import { ALL_LOCALES } from "@/i18n/routing";
import { campaignFrom, campaignQuery } from "./campaign";

// Cookie-free visit counts (Vercel Web Analytics, decision 79), on the
// public website only (UX, the 1.0 launch item: never the web journal or
// the auth pages), behind the "web-analytics" condition: the privacy
// policy's {pending:web_analytics} lines and the collection go live
// together. Only the page address is sent, and it's scrubbed first (UX +
// reviewer): no query string or fragment (auth links carry tokens) except
// our own three campaign labels (lib/campaign), entry ids and dates become
// [id] / [date], and nothing at all is sent for the auth pages. Never any
// diary content or user id.

// The public pages (without a locale prefix): the only ones counted.
const PUBLIC_PAGES = ["/", "/support", "/privacy", "/terms", "/account-deletion"];
const PUBLIC_PREFIXES = ["/help"];

export function isPublicPage(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const rest = (ALL_LOCALES as readonly string[]).includes(segments[0] ?? "") && segments[0] !== "en" ? segments.slice(1) : segments;
  const path = `/${rest.join("/")}`;
  return PUBLIC_PAGES.includes(path) || PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

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
  // Our own campaign labels only (UX): every other query and the fragment go.
  const campaign = campaignFrom(url.search);
  return `${url.origin}/${path}${campaign ? `?${campaignQuery(campaign)}` : ""}`;
}

// A "not found" page sends nothing (it's no page of ours, and its address can
// be anything someone typed). A notFound() inside a locale page renders
// [locale]/not-found.tsx within the layout that carries the analytics, so
// that page marks itself (Web Tester, #21).
export const NOT_FOUND_MARK = "data-not-found";

export function scrubEvent<T extends { url: string }>(event: T): T | null {
  if (typeof document !== "undefined" && document.querySelector(`[${NOT_FOUND_MARK}]`)) return null;
  // Public pages only: a view of the journal or a sign-in page is never sent,
  // even when the script came along from a public page.
  let pathname: string;
  try {
    pathname = new URL(event.url).pathname;
  } catch {
    return null;
  }
  if (!isPublicPage(pathname)) return null;
  const url = scrubUrl(event.url);
  return url === null ? null : { ...event, url };
}
