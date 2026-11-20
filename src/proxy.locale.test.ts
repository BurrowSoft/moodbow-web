// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// An auth email's link carries its own language (the Mobile Dev, 20 Nov): an English email links to the unprefixed
// /auth/confirm, and the browser's NEXT_LOCALE (or Accept-Language) must not turn it into /fr/auth/confirm. Against the
// REAL next-intl middleware, with French offered so detection is on everywhere else.
vi.mock("./i18n/routing", () => ({
  routing: { locales: ["en", "fr"], defaultLocale: "en", localePrefix: "as-needed", localeDetection: true },
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
const { default: proxy } = await import("./proxy");

// A French-minded browser: a NEXT_LOCALE=fr cookie from earlier French pages, a French Accept-Language, a page load.
const french = (path: string, cookie = "NEXT_LOCALE=fr") =>
  proxy(new NextRequest(`https://www.moodbow.com${path}`, { headers: { cookie, "accept-language": "fr-FR,fr;q=0.9", "sec-fetch-dest": "document" } }));
const LINK = "/auth/confirm?token_hash=t0k3n&type=email_change";
const localeCookie = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("NEXT_LOCALE=")) ?? null;

describe("an English auth email's link stays English (no detection on the unprefixed /auth/confirm)", () => {
  it("with NEXT_LOCALE=fr: no redirect to /fr; the English page, the query kept", async () => {
    const res = await french(LINK);
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toContain("/en/auth/confirm?token_hash=t0k3n&type=email_change");
  });

  it("the stale NEXT_LOCALE becomes en, so the confirm's unprefixed next page stays English too", async () => {
    expect(localeCookie(await french(LINK))).toMatch(/^NEXT_LOCALE=en;/);
  });

  it("with no cookie, a French browser still gets the English link's page", async () => {
    const res = await french(LINK, "");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toContain("/en/auth/confirm");
  });

  it("a French email's link (/fr/auth/confirm) stays French", async () => {
    const res = await french("/fr/auth/confirm?token_hash=t0k3n&type=signup", "NEXT_LOCALE=en");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite") ?? "").not.toContain("/en/");
  });

  it("everywhere else, detection is as before: the unprefixed home with NEXT_LOCALE=fr goes to /fr", async () => {
    const res = await french("/");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/fr");
  });
});
