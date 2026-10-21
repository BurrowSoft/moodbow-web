// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

// Until Thai is served (thai-offered-live), the app's /th/help… and
// /th/privacy, /th/terms, /th/account-deletion go to the English page
// instead of a 404 (decision 212): the app's Me → Help & FAQ and legal links
// open /<language>/…, and the app is English-only for now.
let locales: string[] = ["en"];
vi.mock("./i18n/routing", () => ({
  routing: {
    get locales() {
      return locales;
    },
    defaultLocale: "en",
  },
}));
vi.mock("./lib/sitemapPages", () => ({ isHiddenPage: () => false, pagePath: (p: string) => p }));
vi.mock("./lib/supabase/proxy", () => ({
  needsSession: () => false,
  refreshSession: async () => ({ cookies: [], signedOut: null, outage: false }),
  authCookieNames: () => [],
  authCookieUid: () => null,
  signedInOnly: () => false,
  WIPE_COOKIE: "mb_wipe",
  WIPE_COOKIE_OPTIONS: {},
}));
vi.mock("next-intl/middleware", () => ({ default: () => (req: NextRequest) => NextResponse.next({ request: { headers: req.headers } }) }));
const { default: proxy } = await import("./proxy");

const go = (path: string) => proxy(new NextRequest(`https://www.moodbow.com${path}`));

describe("proxy: /th pages the app links to, while Thai isn't served", () => {
  it("Help and its articles go to the English Help (307), keeping the query", async () => {
    locales = ["en"];
    for (const [from, to] of [
      ["/th/help", "/help"],
      ["/th/help/", "/help/"],
      ["/th/help/check-ins", "/help/check-ins"],
      ["/TH/Help/check-ins?x=1", "/Help/check-ins?x=1"],
    ]) {
      const res = await go(from);
      expect(res.status, from).toBe(307);
      const url = new URL(res.headers.get("location")!);
      expect(url.pathname + url.search, from).toBe(to);
    }
  });

  it("the legal pages go to the English page", async () => {
    locales = ["en"];
    for (const page of ["/privacy", "/terms", "/account-deletion"]) {
      const res = await go(`/th${page}`);
      expect(res.status, page).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe(page);
    }
  });

  it("nothing else under /th, and no lookalikes", async () => {
    locales = ["en"];
    for (const path of ["/th", "/th/app", "/th/support", "/th/helpful", "/th/privacy-x", "/help"]) {
      expect((await go(path)).status, path).not.toBe(307);
    }
  });

  it("once Thai is served, /th pages are Thai: no redirect", async () => {
    locales = ["en", "th"];
    for (const path of ["/th/help", "/th/privacy"]) {
      expect((await go(path)).status, path).not.toBe(307);
    }
  });
});
