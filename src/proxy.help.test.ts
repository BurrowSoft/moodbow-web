// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

// The Web Tester (15 Nov): /help/tags on Production, with tags-live unmet, answered 404 with
// Next's bare error shell (html id="__next_error__", no title, no h1), because the page's own
// notFound() runs under a root layout without <html>. The proxy now sends a missing or
// unpublished Help article to the generic not-found page before anything renders, like the
// gated pages (proxy.gated.test.ts).
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
const rewritten = (res: Response) => (res.headers.get("x-middleware-rewrite") ?? "").includes("/_not-found-page");

describe("proxy on a Production build: Help articles", () => {
  it("a missing or unpublished article: 404, rewritten to the generic not-found page, in every language's path", async () => {
    for (const slug of ["no-such-article", "ai-reflections"]) {
      for (const path of [`/help/${slug}`, `/help/${slug}/`, `/fr/help/${slug}`, `/es/help/${slug}?country=TH`, `/pt-br/help/${slug}`]) {
        const res = await go(path);
        expect(res.status, path).toBe(404);
        expect(rewritten(res), path).toBe(true);
      }
    }
  });

  // UX, 15 Nov (the Web Tester's #345 finding): an article's address is lowercase.
  it("an address with capitals: 308 to the lowercase article, keeping the language prefix and the query", async () => {
    const cases: [string, string][] = [
      ["/help/Tags", "/help/tags"],
      ["/HELP/TAGS/", "/help/tags/"],
      ["/es/help/Get-Help-Now?country=TH", "/es/help/get-help-now?country=TH"],
      ["/pt-br/Help/Safety-Plan", "/pt-br/help/safety-plan"],
    ];
    for (const [from, to] of cases) {
      const res = await go(from);
      expect(res.status, from).toBe(308);
      expect(res.headers.get("location"), from).toBe(`https://www.moodbow.com${to}`);
    }
    // Already lowercase, or not a Help article: no redirect.
    for (const path of ["/help/tags", "/help", "/Privacy", "/xx/help/Tags/more"]) expect((await go(path)).status, path).not.toBe(308);
  });

  it("a published article and the Help index render as before (no rewrite)", async () => {
    for (const path of ["/help", "/help/check-ins", "/es/help/get-help-now?country=TH", "/fr/help/tags", "/pt-br/help/things-that-help"]) {
      const res = await go(path);
      expect(res.status, path).not.toBe(404);
      expect(rewritten(res), path).toBe(false);
    }
  });
});
