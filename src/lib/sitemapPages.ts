import { HELP_GATE } from "./helpGate";
import { conditionMet, pageGate, type BuildEnv, type ConditionId } from "./conditions";

// Pages and the condition each one waits on. Used by the sitemap (gated
// pages are listed only once met; drafts, /email-confirmed and the signed-in
// area never) and by the proxy (hidden gated pages are 404s at the routing
// level). prefix: the entry also covers everything below it (/app/...); "children": only what's
// below it, not the path itself. gates: every condition the page needs (hidden if any is hidden).
// The first entry that matches wins, so a gated page inside the signed-in area comes before /app.
type PageEntry = { path: string; gate?: ConditionId; gates?: ConditionId[]; prefix?: boolean | "children"; sitemap?: false };

// The signed-in area's own gated pages (the Web Tester's production sweep, 14 Nov): their page
// calls notFound() too, but /app streams (app/loading.tsx), so by then the 200 and the feature's
// title are already sent. Gated here, they're true 404s with the generic title before rendering.
// pagesGated.test.ts fails if a page's own gate isn't listed here.
// Never in the sitemap: the signed-in area.
const app = (p: Omit<PageEntry, "sitemap">): PageEntry => ({ ...p, sitemap: false });
const APP_GATED: PageEntry[] = [
  app({ path: "/app/bo", gate: "bo-live", prefix: true }),
  app({ path: "/app/insights/review", gate: "plus", prefix: true }),
  app({ path: "/app/me/plus", gate: "plus", prefix: true }),
  app({ path: "/app/me/journal-pdf", gate: "plus", prefix: true }),
  // Letters are Plus from the day they ship (lettersGate: letters-live AND plus).
  app({ path: "/app/me/letters", gates: ["letters-live", "plus"], prefix: true }),
  app({ path: "/app/me/appointment", gate: "appointment-live", prefix: true }),
  app({ path: "/app/me/safety-plan", gate: "safety-plan-live", prefix: true }),
  // The grounding exercises below the toolbox need both; the toolbox page itself only its own.
  app({ path: "/app/me/toolbox", gates: ["toolbox-live", "grounding-live"], prefix: "children" }),
  app({ path: "/app/me/toolbox", gate: "toolbox-live" }),
  app({ path: "/app/print", gate: "print-live", prefix: true }),
  app({ path: "/app/write/good-things", gate: "good-things-live", prefix: true }),
];

const PAGES: PageEntry[] = [
  { path: "/" },
  { path: "/support" },
  { path: "/help", gate: HELP_GATE, prefix: true },
  { path: "/privacy", gate: "privacy-text-approved" },
  { path: "/terms", gate: "terms-text-approved" },
  { path: "/consumer-health-data", gate: "consumer-health-data-approved" },
  { path: "/account-deletion", gate: "delete-account-live" },
  // Test only, never met: a 404 on Production before the signed-in area's own checks.
  { path: "/app/test", gate: "test-only-unavailable-page", prefix: true, sitemap: false },
  ...APP_GATED,
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
// page that is hidden on this build (pageGate → "hidden"). met: as pageGate.
export function isHiddenPage(path: string, build?: BuildEnv, met?: (id: ConditionId) => boolean): boolean {
  const normalized = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const page = PAGES.find((p) => (p.path === normalized && p.prefix !== "children") || (p.prefix && normalized.startsWith(`${p.path}/`)));
  const gates = page ? (page.gates ?? (page.gate ? [page.gate] : [])) : [];
  return gates.some((gate) => pageGate(gate, build, met) === "hidden");
}

// The gated pages inside the signed-in area, as listed for the routing-level 404 (for the guard test).
export const appGatedPages = (): { path: string; gates: ConditionId[]; prefix?: boolean | "children" }[] =>
  APP_GATED.map((p) => ({ path: p.path, gates: p.gates ?? (p.gate ? [p.gate] : []), prefix: p.prefix }));
