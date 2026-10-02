import { conditionMet, type ConditionId } from "./conditions";

// Public pages for the sitemap. A gated page is listed only once its
// condition is met (drafts and /email-confirmed are never listed).
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
