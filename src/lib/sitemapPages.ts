import { conditionMet, pageGate, type BuildEnv, type ConditionId } from "./conditions";

// Public pages and the condition each one waits on. Used by the sitemap
// (gated pages are listed only once met; drafts and /email-confirmed never)
// and by the proxy (hidden gated pages are 404s at the routing level).
const PAGES: { path: string; gate?: ConditionId }[] = [
  { path: "/" },
  { path: "/support" },
  { path: "/privacy", gate: "privacy-text-approved" },
  { path: "/terms", gate: "terms-text-approved" },
  { path: "/account-deletion", gate: "delete-account-live" },
];

export function sitemapPaths(met: (id: ConditionId) => boolean = conditionMet): string[] {
  return PAGES.filter((p) => !p.gate || met(p.gate)).map((p) => p.path);
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
  const page = PAGES.find((p) => p.path === normalized);
  return !!page?.gate && pageGate(page.gate, build) === "hidden";
}
