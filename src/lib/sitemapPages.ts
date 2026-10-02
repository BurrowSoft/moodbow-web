import { conditionMet, pageGate, type BuildEnv, type ConditionId } from "./conditions";

// Pages and the condition each one waits on. Used by the sitemap (gated
// pages are listed only once met; drafts, /email-confirmed and the signed-in
// area never) and by the proxy (hidden gated pages are 404s at the routing
// level). prefix: the entry also covers everything below it (/app/...).
type PageEntry = { path: string; gate?: ConditionId; prefix?: boolean; sitemap?: false };
const PAGES: PageEntry[] = [
  { path: "/" },
  { path: "/support" },
  { path: "/privacy", gate: "privacy-text-approved" },
  { path: "/terms", gate: "terms-text-approved" },
  { path: "/account-deletion", gate: "delete-account-live" },
  { path: "/app", gate: "web-journal-live", prefix: true, sitemap: false },
  { path: "/sign-in", gate: "web-journal-live", sitemap: false },
  { path: "/forgot-password", gate: "web-journal-live", sitemap: false },
  { path: "/welcome", gate: "web-journal-live", sitemap: false },
  { path: "/consent", gate: "web-journal-live", sitemap: false },
  { path: "/sign-up", gate: "web-journal-live", sitemap: false },
  { path: "/setup", gate: "web-journal-live", sitemap: false },
];

export function sitemapPaths(met: (id: ConditionId) => boolean = conditionMet): string[] {
  return PAGES.filter((p) => p.sitemap !== false && (!p.gate || met(p.gate))).map((p) => p.path);
}

// The page a request path points at: percent-decoded (so /%70rivacy is
// /privacy), lowercased (Vercel matches routes case-insensitively, so
// /PRIVACY reaches the privacy page) and without a locale prefix. A
// malformed escape is left as is (it matches no page).
export function pagePath(pathname: string, locales: readonly string[]): string {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // keep the raw path
  }
  const lower = decoded.toLowerCase();
  const [, first = ""] = lower.split("/");
  return locales.some((l) => l.toLowerCase() === first) ? lower.slice(first.length + 1) || "/" : lower;
}

// True when `path` (without a locale prefix, e.g. "/privacy") is a gated
// page that is hidden on this build (pageGate → "hidden").
export function isHiddenPage(path: string, build?: BuildEnv): boolean {
  const normalized = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const page = PAGES.find((p) => p.path === normalized || (p.prefix && normalized.startsWith(`${p.path}/`)));
  return !!page?.gate && pageGate(page.gate, build) === "hidden";
}
