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
    for (const path of ["/th", "/th/app", "/th/sign-in", "/th/helpful", "/th/support-x", "/th/privacy-x", "/th/privacy/other", "/help", "/support"]) {
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

describe("proxy: the app's other languages", () => {
  const to = async (path: string) => (await go(path)).headers.get("location");
  it("not served: the English page", async () => {
    locales = ["en"];
    expect(await to("/fr/help/check-ins")).toBe("https://www.moodbow.com/help/check-ins");
    expect(await to("/de/privacy")).toBe("https://www.moodbow.com/privacy");
    for (const language of ["de", "it", "th"]) expect(await to(`/${language}/privacy/next`), language).toBe("https://www.moodbow.com/privacy/next");
    for (const language of ["de", "it", "th", "fr", "es", "pt", "pt-br"]) expect(await to(`/${language}/support`), language).toBe("https://www.moodbow.com/support");
    expect(await to("/pt/help")).toBe("https://www.moodbow.com/help");
    expect(await to("/pt-br/help")).toBe("https://www.moodbow.com/help");
  });
  it("the app's /pt goes to the web's /pt-br when that's served; a served language stays", async () => {
    locales = ["en", "pt-br", "fr"];
    expect(await to("/pt/help/check-ins")).toBe("https://www.moodbow.com/pt-br/help/check-ins");
    expect(await to("/pt/terms")).toBe("https://www.moodbow.com/pt-br/terms");
    expect(await to("/pt/support")).toBe("https://www.moodbow.com/pt-br/support");
    expect(await to("/fr/support")).toBeNull();
    expect(await to("/pt/privacy/next")).toBe("https://www.moodbow.com/pt-br/privacy/next");
    expect(await to("/fr/privacy/next")).toBeNull();
    expect(await to("/pt-br/help")).toBeNull();
    expect(await to("/fr/help")).toBeNull();
  });
});
