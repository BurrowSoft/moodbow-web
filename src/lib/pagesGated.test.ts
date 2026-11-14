// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ConditionId } from "./conditions";
import { isHiddenPage } from "./sitemapPages";

// Every page in the signed-in area that hides itself behind a condition (pageGate(...) or
// lettersGate() → notFound()) must also be hidden at the routing level (sitemapPages, the proxy):
// /app streams (app/loading.tsx), so a page's own notFound() comes after the 200 and the feature's
// title are sent (the Web Tester's production sweep, 14 Nov). A new gated page fails here until it
// is listed.
const APP = join("src", "app", "[locale]", "app");
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : n === "page.tsx" ? [p] : []; });

// The route of a page file, with each dynamic segment filled by a sample value.
const routeOf = (file: string) => {
  const parts = file.split(/[\\/]/);
  const rel = parts.slice(parts.indexOf("[locale]") + 1, -1);
  return "/" + rel.map((s) => (s.startsWith("[") ? "sample" : s)).join("/");
};

// The conditions a page's own notFound() waits on.
const gatesOf = (source: string): ConditionId[] => {
  const ids = new Set<ConditionId>();
  for (const m of source.matchAll(/pageGate\("([a-z0-9-]+)"\) === "hidden"/g)) ids.add(m[1] as ConditionId);
  if (/lettersGate\(\) === "hidden"/.test(source)) ["letters-live", "plus"].forEach((id) => ids.add(id as ConditionId));
  return [...ids];
};

const pages = walk(APP)
  .map((file) => ({ file, route: routeOf(file), gates: gatesOf(readFileSync(file, "utf8")) }))
  .filter((p) => p.gates.length > 0 && readFileSync(p.file, "utf8").includes("notFound()"));

describe("gated pages in the signed-in area are hidden at the routing level too", () => {
  it("finds the gated pages (the scan works)", () => {
    const routes = pages.map((p) => p.route);
    for (const route of ["/app/me/plus", "/app/me/letters", "/app/me/toolbox", "/app/me/toolbox/sample"]) expect(routes).toContain(route);
  });

  it.each(pages.map((p) => [p.route, p.gates] as const))("%s: hidden on Production when any of %j is unmet", (route, gates) => {
    const prod = { vercelEnv: "production" };
    for (const unmet of gates) {
      // Only this one condition unmet: the route must still be a routing-level 404.
      expect(isHiddenPage(route, prod, (id) => id !== unmet), `${route} with ${unmet} unmet`).toBe(true);
    }
    // All met: not hidden by the routing table (the page decides the rest, e.g. an unknown id).
    expect(isHiddenPage(route, prod, () => true), `${route} all met`).toBe(false);
    // A preview shows drafts.
    expect(isHiddenPage(route, { vercelEnv: "preview" }, () => false), `${route} on a preview`).toBe(false);
    // The web journal itself off: hidden even with the page's own conditions met (the first match wins,
    // so each entry carries /app's gate too; the Reviewer, #338).
    expect(isHiddenPage(route, prod, (id) => id !== "web-journal-live"), `${route} with web-journal-live unmet`).toBe(true);
  });
});
