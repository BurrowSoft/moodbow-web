// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import conditions from "../content/conditions.json";
import { appGatedPages } from "./lib/sitemapPages";

// The Web Tester's production sweep (14 Nov): /app/me/plus and /app/me/letters with their
// conditions unmet answered 200 with the not-found body, under the feature's own tab title,
// because /app streams (app/loading.tsx) before the page's own notFound() runs. On a Production
// build the proxy now rewrites every gated page of the signed-in area to the generic not-found
// page with a real 404, before anything renders: no status 200, no feature name in the title.
vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
vi.stubEnv("NEXT_PUBLIC_SHOW_DRAFTS", "");
vi.mock("./lib/supabase/proxy", () => ({
  needsSession: () => false,
  refreshSession: async () => ({ cookies: [], signedOut: null, outage: false }),
  actionWithoutSession: () => false,
  authCookieNames: () => [],
  authCookieUid: () => null,
  signedInOnly: () => false,
  WIPE_COOKIE: "mb_wipe",
  WIPE_COOKIE_OPTIONS: {},
}));
vi.mock("next-intl/middleware", () => ({ default: () => (req: NextRequest) => NextResponse.next({ request: { headers: req.headers } }) }));
const { default: proxy } = await import("./proxy");

const go = (path: string) => proxy(new NextRequest(`https://www.moodbow.com${path}`));
const met = (id: string) => (conditions as Record<string, { met: boolean }>)[id]?.met === true;

// One real path per listed page: the page itself, or (for "children") one below it.
const samples = appGatedPages().map((p) => ({ ...p, sample: p.prefix === "children" ? `${p.path}/body-scan` : p.path }));

describe("proxy on a Production build: the signed-in area's gated pages are true 404s", () => {
  it("lists the pages the Web Tester found, and every Plus page", () => {
    const paths = samples.map((s) => s.sample);
    for (const path of ["/app/me/plus", "/app/me/letters", "/app/me/journal-pdf", "/app/insights/review"]) expect(paths).toContain(path);
  });

  it("each page whose condition is unmet: 404, rewritten to the generic not-found page, in every language's path", async () => {
    const hidden = samples.filter((s) => !s.gates.every(met));
    expect(hidden.length).toBeGreaterThan(0);
    for (const { sample } of hidden) {
      for (const path of [sample, `${sample}/`, `/fr${sample}`, `/es${sample}?x=1`]) {
        const res = await go(path);
        expect(res.status, path).toBe(404);
        expect(res.headers.get("x-middleware-rewrite"), path).toContain("/_not-found-page");
      }
    }
  });

  it("a page whose conditions are all met renders as before (no rewrite)", async () => {
    for (const { sample } of samples.filter((s) => s.gates.every(met))) {
      const res = await go(sample);
      expect(res.status, sample).not.toBe(404);
      expect(res.headers.get("x-middleware-rewrite") ?? "", sample).not.toContain("/_not-found-page");
    }
  });
});
