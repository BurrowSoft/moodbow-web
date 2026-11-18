import { ALL_LOCALES } from "@/i18n/routing";
import { campaignFrom, campaignQuery } from "./campaign";
import { isTapEvent, validTapData } from "./analyticsEvents";

// Cookie-free usage counts (Vercel Web Analytics, decision 79; scope and
// rules in specs/analytics.md, UX & PM's rulings of 17 Nov): page views and
// button taps, in aggregate, behind the "web-analytics" condition, so the
// privacy policy's {pending:web_analytics} lines and the collection go live
// together. Only a scrubbed page address is sent: no query string or
// fragment (auth links carry tokens) except our own three campaign labels
// (lib/campaign); entry ids, days and months become [id] / [date] /
// [month], anything that doesn't look like one of our page names becomes
// [other]. Never sent at all: the auth email-link pages (/auth/*), a "not
// found" page, and the safety plan (UX: never counted, in any form). Never
// any diary content or user id.

const segmentsOf = (pathname: string) => pathname.split("/").filter(Boolean);
const withoutLocale = (segments: string[]) => ((ALL_LOCALES as readonly string[]).includes(segments[0]?.toLowerCase() ?? "") ? segments.slice(1) : segments);

// Pages nothing is ever sent for, with or without a locale prefix.
export function isCountedPage(pathname: string): boolean {
  const rest = withoutLocale(segmentsOf(pathname)).map((s) => s.toLowerCase());
  if (rest[0] === "auth") return false;
  // A shared week (1.4 G): someone else's summary, opened by a person without an account. Never
  // counted, not even its name (plans/PLAN-trusted-share.md §4).
  if (rest[0] === "s") return false;
  if (rest[0] === "app" && rest[1] === "me" && rest[2] === "safety-plan") return false;
  return true;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;
// Long opaque segments (tokens, hashes) are never page names.
const OPAQUE = /^[A-Za-z0-9_-]{20,}$/;
// Our page names and slugs: lowercase words joined by hyphens.
const PAGE_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
// Already scrubbed (scrubbing twice changes nothing).
const PLACEHOLDER = /^\[(id|date|month|token|other)\]$/;

function scrubSegment(segment: string, index: number): string {
  if (index === 0 && (ALL_LOCALES as readonly string[]).includes(segment.toLowerCase())) return segment;
  if (PLACEHOLDER.test(segment)) return segment;
  if (UUID.test(segment)) return "[id]";
  if (ISO_DATE.test(segment)) return "[date]";
  if (ISO_MONTH.test(segment)) return "[month]";
  // A page name first: /consumer-health-data is 20 characters but no token.
  if (PAGE_NAME.test(segment) && segment.length <= 60 && segment.split("-").every((part) => part.length <= 16)) return segment;
  return OPAQUE.test(segment) ? "[token]" : "[other]";
}

export function scrubUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!isCountedPage(url.pathname)) return null;
  let segments: string[];
  try {
    segments = segmentsOf(url.pathname).map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }
  const path = segments.map(scrubSegment).join("/");
  // Our own campaign labels only (UX): every other query and the fragment go.
  const campaign = campaignFrom(url.search);
  return `${url.origin}/${path}${campaign ? `?${campaignQuery(campaign)}` : ""}`;
}

// A "not found" page sends nothing (it's no page of ours, and its address can
// be anything someone typed). A notFound() inside a locale page renders
// [locale]/not-found.tsx within the layout that carries the analytics, so
// that page marks itself (Web Tester, #21).
export const NOT_FOUND_MARK = "data-not-found";

// What Vercel's script hands beforeSend: a page view, or a custom event with
// its name and data in payload.
type VercelEvent = { type: "pageview" | "event"; url: string; payload?: unknown };

export function scrubEvent<T extends VercelEvent>(event: T): T | null {
  if (typeof document !== "undefined" && document.querySelector(`[${NOT_FOUND_MARK}]`)) return null;
  const url = scrubUrl(event.url);
  if (url === null) return null;
  if (event.type === "pageview") return { ...event, url };
  if (event.type !== "event") return null;
  // A tap: a name from the closed list, with exactly its allowed choice or
  // nothing. Anything else (a stray custom event, extra data) is dropped.
  const payload = event.payload as { name?: unknown; data?: unknown } | undefined;
  if (!payload || !isTapEvent(payload.name) || !validTapData(payload.name, payload.data ?? undefined)) return null;
  const clean = payload.data == null ? { name: payload.name } : { name: payload.name, data: payload.data };
  return { ...event, url, payload: clean };
}
