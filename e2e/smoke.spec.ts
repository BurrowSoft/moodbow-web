import { expect, test } from "@playwright/test";
import conditions from "../content/conditions.json";
import fr from "../src/messages/fr.json";

// Smoke tests for the public site. They expect a test build, where gated
// pages render as drafts: a Vercel Preview, or a local/CI build made with
// NEXT_PUBLIC_SHOW_DRAFTS=1 npm run build. Everywhere else gated pages are
// 404s (fail closed), pinned by the pageGate unit tests.

const CANONICAL = "https://www.moodbow.com";
// The legal pages' state (the launch-step guard requires them live): the
// checks of /privacy and /terms follow it, so nothing here pins it
// (reviewer #100 B2).
const LEGAL = conditions["privacy-text-approved"].met && conditions["terms-text-approved"].met;

test.describe("home", () => {
  test("English at /", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Moodbow — A private journal for your days");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // The store frames' look (launch readiness): the arc, the headline, the
    // three blocks and Private by design.
    await expect(page.getByTestId("moodbow-arc")).toBeVisible();
    await expect(page.getByTestId("moodbow-arc")).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your month, as a rainbow");
    // The web journal is live (launch step): Start and Sign in, no Coming
    // soon and no Get notified.
    await expect(page.getByTestId("home-start")).toHaveAttribute("href", "/welcome");
    await expect(page.getByTestId("home-sign-in")).toHaveAttribute("href", "/sign-in");
    await expect(page.getByTestId("home-coming-soon")).toHaveCount(0);
    await expect(page.getByTestId("home-notify")).toHaveCount(0);
    for (const title of ["A 10-second check-in", "Write about your day", "See what goes together in your days", "Private by design"]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    // No AI claim while AI isn't live; store badges are text only.
    await expect(page.getByText("Moodbow writes back")).toHaveCount(0);
    await expect(page.getByText(/\bAI\b/)).toHaveCount(0);
    // Follows each store's flag, so a launch-day flip passes on its own.
    const play = conditions["play-live"].met;
    const appStore = conditions["appstore-live"].met;
    const storeLine = page.getByTestId("home-stores");
    await expect(storeLine).toContainText(play && appStore ? "Get the app:" : play ? "Coming soon to the App Store" : appStore ? "Coming soon to Google Play" : "Coming soon to Google Play and the App Store");
    await expect(storeLine.getByRole("link")).toHaveCount(Number(play) + Number(appStore));
  });

  test("200% zoom on a phone (a 160 px page): nothing scrolls sideways (Web Tester, #65)", async ({ page }) => {
    await page.setViewportSize({ width: 160, height: 640 });
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const start = await page.getByTestId("home-start").boundingBox();
    expect(start!.x + start!.width).toBeLessThanOrEqual(160);
  });

  test("200% zoom on a phone (a 160 px page): the other public pages and languages don't scroll sideways either", async ({ page }) => {
    await page.setViewportSize({ width: 160, height: 640 });
    for (const path of ["/help", "/help/getting-started", "/privacy", "/terms", "/support", "/account-deletion", "/de", "/it", "/fr", "/es", "/pt-br", "/th"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("security headers: an enforced per-request CSP nonce on every script, no violations, and Permissions-Policy (audit A1 + A2)", async ({ page, request }) => {
    // Enforced: anything the policy misses is blocked, so count violations.
    await page.addInitScript(() => {
      const w = window as unknown as { cspViolations: string[] };
      w.cspViolations = [];
      document.addEventListener("securitypolicyviolation", (e) => w.cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    const violations = () => page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);
    const res = await page.goto("/");
    expect(res!.headers()["content-security-policy-report-only"]).toBeUndefined();
    const csp = res!.headers()["content-security-policy"];
    expect(csp).toBeTruthy();
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain("frame-ancestors 'none'");
    // Every script Next and the layout render carries this request's nonce.
    // The JSON-LD data block (live platforms, #89) isn't executed, so the CSP
    // doesn't apply to it.
    const scripts = await page.locator('script:not([type="application/ld+json"])').evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce));
    expect(scripts.length).toBeGreaterThan(0);
    for (const n of scripts) expect(n).toBe(nonce);
    await page.waitForLoadState("networkidle");
    expect(await violations()).toEqual([]);
    // The 404 page too (rendered per request, not prerendered: Web Tester, #69).
    const missing = await page.goto("/this-page-does-not-exist");
    expect(missing!.status()).toBe(404);
    const missingNonce = missing!.headers()["content-security-policy"].match(/'nonce-([^']+)'/)?.[1];
    const missingScripts = await page.locator("script").evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce));
    expect(missingScripts.length).toBeGreaterThan(0);
    for (const n of missingScripts) expect(n).toBe(missingNonce);
    await page.waitForLoadState("networkidle");
    expect(await violations()).toEqual([]);
    // A fresh nonce per request.
    const again = (await request.get("/")).headers()["content-security-policy"];
    expect(again.match(/'nonce-([^']+)'/)?.[1]).not.toBe(nonce);
    const permissions = res!.headers()["permissions-policy"];
    expect(permissions).toContain("camera=()");
    expect(permissions).toContain("geolocation=()");
    expect(permissions).toContain("web-share=(self)");
  });

  test("SEO tags use the www canonical host", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", CANONICAL);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", CANONICAL);
    // The launch image once the web journal is live (metadata.ts).
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${CANONICAL}/og-launch.png`);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", CANONICAL);
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", CANONICAL);
    await expect(page.locator('link[rel="alternate"][hreflang="th"]')).toHaveCount(0);
    await page.goto("/support");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${CANONICAL}/support`);
  });

  test("the og image and icons are served", async ({ request }) => {
    for (const path of ["/og-image.png", "/og-launch.png", "/favicon.ico", "/favicon.svg", "/apple-touch-icon.png", "/manifest.webmanifest"]) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
  });

  test("visit counts: no analytics script while web-analytics is unmet, even with campaign labels", async ({ page }) => {
    for (const path of ["/?utm_source=ig&utm_campaign=launch", "/support", "/app"]) {
      await page.goto(path);
      await expect(page.locator('script[src*="/_vercel/insights"], script[src*="va.vercel-scripts"]'), path).toHaveCount(0);
    }
  });
});

// French, Spanish and Portuguese are offered. Thai, behind thai-offered-live,
// is unmet: this CI build is a draft build (NEXT_PUBLIC_SHOW_DRAFTS=1), so /th
// is served there to be read, but it isn't offered (Production: a 404, see the
// unit tests).
test.describe("language: the offered ones, and Thai as a draft (thai-offered-live)", () => {
  test("a French browser lands on French; the switcher lists what's offered, not the drafts", async ({ browser }) => {
    const context = await browser.newContext({ locale: "fr-FR" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/fr$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    const switcher = page.locator('footer nav [lang]');
    await expect(switcher).toHaveCount(4);
    await expect(page.locator('footer nav [lang="th"]')).toHaveCount(0);
    await context.close();
  });

  test("/th: the home page in Thai, not in the switcher, no hreflang to it", async ({ page }) => {
    const res = await page.goto("/th");
    expect(res?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "th");
    await expect(page.locator('footer nav [lang="th"]')).toHaveCount(0);
    await page.goto("/");
    await expect(page.locator('link[rel="alternate"][hreflang="th"]')).toHaveCount(0);
    await expect(page.locator('link[rel="alternate"][hreflang="fr"]')).toHaveCount(1);
  });

  test("/help/backing-up: the steps keep their numbers (an ol in help or legal text)", async ({ page }) => {
    const res = await page.goto("/help/backing-up");
    expect(res?.status()).toBe(200);
    const steps = page.locator(".legal-prose ol");
    await expect(steps).toHaveCSS("list-style-type", "decimal");
    await expect(steps.locator("li")).toHaveCount(4);
    // The bullets stay as they were.
    await page.goto("/help/getting-started");
    await expect(page.locator(".legal-prose ul").first()).toHaveCSS("list-style-type", "disc");
  });

  // axe scrollable-region-focusable at 390 px (Web Tester): the tables
  // scroll inside a focusable, named region; the page itself doesn't.
  test("/privacy at 390 px: each table scrolls in a region the keyboard reaches", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const res = await page.goto("/privacy");
    expect(res?.status()).toBe(200);
    const regions = page.locator(".legal-prose .table-scroll");
    await expect(regions).toHaveCount(2);
    for (const region of await regions.all()) {
      await expect(region).toHaveAttribute("role", "region");
      await expect(region).toHaveAttribute("tabindex", "0");
      await expect(region).toHaveAttribute("aria-label", /\S/);
      await expect(region.locator("table")).toHaveCount(1);
      await expect(region).toHaveCSS("overflow-x", "auto");
      await region.focus();
      await expect(region).toBeFocused();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  // Vitor, UX & PM 2026-11-06: on phone widths only, every public page.
  test("Try the app: in the footer on a phone width, not on a desktop", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of ["/", "/help", "/privacy", "/terms"]) {
      await page.goto(path);
      const button = page.getByTestId("try-app");
      await expect(button, path).toBeVisible();
      await expect(button, path).toHaveAttribute("href", "/welcome");
      expect((await button.boundingBox())?.height ?? 0, path).toBeGreaterThanOrEqual(44);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    // 200% zoom on a phone: it wraps, and nothing scrolls sideways.
    await page.setViewportSize({ width: 160, height: 640 });
    await page.goto("/");
    await expect(page.getByTestId("try-app")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.getByTestId("try-app")).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("try-app").click();
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByTestId("try-app")).toHaveCount(0);
    // Mid sign-in, it's a link away from what the person is doing.
    await page.goto("/sign-in");
    await expect(page.getByTestId("try-app")).toHaveCount(0);
  });

  test("/th/help/getting-started: the Thai article", async ({ page }) => {
    const res = await page.goto("/th/help/getting-started");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("เริ่มต้นใช้ Moodbow");
  });

  test("/th/privacy: the English text under the Thai line, as /privacy is (draft or live)", async ({ page }) => {
    const res = await page.goto("/th/privacy");
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("page-notice")).toHaveText("หน้านี้มีให้อ่านเป็นภาษาอังกฤษ");
    await expect(page.locator("article")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Moodbow Privacy Policy");
    await expect(page.getByTestId("draft-banner")).toHaveCount(LEGAL ? 0 : 1);
  });

  test("/th/account-deletion: treated as legal: the English page under the Thai line (UX, #112)", async ({ page }) => {
    const res = await page.goto("/th/account-deletion");
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("page-notice")).toHaveText("หน้านี้มีให้อ่านเป็นภาษาอังกฤษ");
    await expect(page.locator("article")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Delete your Moodbow account");
    await expect(page.getByTestId("backups-line")).toHaveText("Copies in our encrypted backups are removed automatically within 8 days.");
    // Never the draft Thai translation of this page (th.json accountDeletion.title).
    await expect(page.locator("main")).not.toContainText("ลบบัญชี Moodbow ของคุณ");
  });
});

test.describe("support", () => {
  test("shows the support email", async ({ page }) => {
    await page.goto("/support");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Support");
    await expect(page.getByRole("link", { name: "support@moodbow.com" })).toHaveAttribute("href", "mailto:support@moodbow.com");
    await expect(page.getByText("Email: support@moodbow.com")).toBeVisible();
  });
});

test.describe("the live legal pages and account deletion (decision 164)", () => {
  for (const [path, heading] of [
    ["/privacy", "Moodbow Privacy Policy"],
    ["/terms", "Moodbow Terms of Use"],
  ] as const) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.locator('[data-content="article"]')).toHaveCount(1);
      if (LEGAL) {
        await expect(page.getByTestId("draft-banner")).toHaveCount(0);
        await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      } else {
        await expect(page.getByTestId("draft-banner")).toBeVisible();
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
      }
    });
  }

  test("the live privacy text: unmet pending blocks hidden, met ones shown, no to-confirm marks", async ({ page }) => {
    await page.goto("/privacy");
    const article = page.locator('[data-content="article"]');
    await expect(article.getByRole("heading", { level: 2, name: "The short version" })).toBeVisible();
    await expect(article.getByText("Last updated: 6 November 2026")).toBeVisible();
    await expect(article).not.toContainText("Google Play, Apple App Store");
    await expect(article).toContainText("disappear automatically within 8 days");
    // AI is off: no line may point at a Me → AI screen (decision 69).
    await expect(article).not.toContainText("Me → AI");
    // What stays on the device, as the 0.9 app has it (Vitor's "ok device
    // sentences"): the app-lock PIN and the share cards.
    await expect(article).toContainText("unsent drafts, your app-lock PIN, and the share cards you create.");
    // UX resolved every to-confirm mark (decision 67).
    await expect(article.locator("mark.legal-todo")).toHaveCount(0);
    // The draft panel (unmet pending blocks) exists only while it's a draft.
    const panel = page.getByTestId("legal-hidden");
    if (LEGAL) await expect(panel).toHaveCount(0);
    else await expect(panel).toContainText("purchases");
    await expect(article.getByTestId("legal-hidden")).toHaveCount(0);
    await page.goto("/terms");
    await expect(page.locator('[data-content="article"]')).not.toContainText("AI credits");
  });

  // RCW 19.373: the link must be on the homepage, and that means any page where
  // personal information is collected.
  test("the Consumer Health Data policy: its page, and its link on every page that collects anything", async ({ page }) => {
    for (const path of ["/", "/welcome", "/consent", "/sign-in", "/forgot-password", "/help", "/support", "/privacy", "/terms", "/fr", "/fr/consent", "/es/sign-in"]) {
      await page.goto(path);
      await expect(page.getByRole("contentinfo").locator('a[href$="/consumer-health-data"]'), path).toBeVisible();
    }
    // Sign-up is reached through Consent.
    await page.goto("/consumer-health-data");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Moodbow: Consumer Health Data Privacy Policy");
    await expect(page.locator('[data-content="article"]')).toContainText("We answer within 10 days");
    await page.goto("/fr/consumer-health-data");
    await expect(page.getByTestId("page-notice")).toHaveText(fr.legal.legalEnglishOnly);
    await expect(page.locator('[data-content="article"]')).toContainText("We answer within 10 days");
  });

  test("the footer links only live pages: account deletion, and the legal pages once live", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Support" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Delete your account" })).toHaveAttribute("href", "/account-deletion");
    for (const name of ["Privacy", "Terms"]) {
      await expect(footer.getByRole("link", { name, exact: true })).toHaveCount(LEGAL ? 1 : 0);
    }
  });

  test("/account-deletion is live: the page, no draft banner", async ({ page }) => {
    await page.goto("/account-deletion");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Delete your Moodbow account");
    await expect(page.getByTestId("draft-banner")).toHaveCount(0);
    await expect(page.locator('[data-content="article"]')).toHaveCount(1);
  });

  test("account deletion: the PM's copy, support email, the 8-day backups line (decisions 44 + 84)", async ({ page }) => {
    await page.goto("/account-deletion");
    await expect(page.getByText("In the app or on the web: open Me → Delete account, type DELETE, and confirm.")).toBeVisible();
    await expect(page.getByRole("link", { name: "support@moodbow.com" })).toHaveAttribute("href", "mailto:support@moodbow.com");
    await expect(page.getByTestId("backups-line")).toHaveText("Copies in our encrypted backups are removed automatically within 8 days.");
  });
});

test.describe("email confirmed", () => {
  test("success", async ({ page }) => {
    await page.goto("/email-confirmed");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Email confirmed.");
    // The web journal is live (decision 134): it moves on. No session here
    // (no Supabase in this build), so to sign in, with Continue and the
    // countdown.
    await expect(page.getByText("You're all set.")).toBeVisible();
    await expect(page.getByTestId("email-confirmed-countdown")).toBeVisible();
    await expect(page.getByTestId("email-confirmed-continue")).toHaveAttribute("href", "/sign-in");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  });

  test("an expired link shows the error and the token is removed from the URL", async ({ page }) => {
    await page.goto("/email-confirmed?code=abc#error=access_denied&error_code=otp_expired&error_description=expired");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link has expired or was already used.");
    await expect(page.getByText("Open Moodbow and ask for a new one.")).toBeVisible();
    await expect(page).toHaveURL(/\/email-confirmed$/);
  });

  test("a successful link with tokens is cleaned too", async ({ page }) => {
    await page.goto("/email-confirmed#access_token=secret&type=signup");
    await expect(page.getByTestId("email-confirmed-ok")).toBeVisible();
    await expect(page).toHaveURL(/\/email-confirmed$/);
  });
});

test.describe("static files", () => {
  test("assetlinks.json is JSON, an empty list, and not redirected", async ({ request }) => {
    const res = await request.get("/.well-known/assetlinks.json", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    expect(await res.json()).toEqual([]);
  });

  test("apple-app-site-association is JSON with no app claims yet, and not redirected", async ({ request }) => {
    const res = await request.get("/.well-known/apple-app-site-association", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    expect(await res.json()).toEqual({ applinks: { details: [] } });
  });

  test("the email logo is a 320×65 PNG, cached, not redirected", async ({ request }) => {
    const res = await request.get("/email/moodbow-logo.png", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    expect(res.headers()["cache-control"]).toContain("max-age=2592000");
    const png = await res.body();
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([320, 65]);
  });

  test("robots.txt points to the sitemap", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("Allow: /");
    expect(body).toMatch(/^Disallow: \/app$/m);
    expect(body).toContain("Disallow: /auth/");
    expect(body).toContain(`Sitemap: ${CANONICAL}/sitemap.xml`);
  });

  test("sitemap.xml lists only live pages", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain(`<loc>${CANONICAL}/</loc>`);
    expect(body).toContain(`<loc>${CANONICAL}/support</loc>`);
    // Live: Help (decision 212) and the account-deletion page; the legal
    // pages once met. Whole addresses: Help's /help/privacy-and-data is listed too.
    expect(body).toContain(`<loc>${CANONICAL}/help</loc>`);
    expect(body).toContain(`<loc>${CANONICAL}/account-deletion</loc>`);
    for (const legal of ["/privacy", "/terms"]) {
      expect(body.includes(`<loc>${CANONICAL}${legal}</loc>`), legal).toBe(LEGAL);
    }
    for (const hidden of ["/email-confirmed", "/th"]) {
      expect(body, hidden).not.toContain(`<loc>${CANONICAL}${hidden}</loc>`);
    }
    expect(body).not.toContain(`${CANONICAL}/th/`);
  });
});

test("unknown pages are a 404 with the site's not-found page", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
});

test.describe("404s are server-rendered (no JS)", () => {
  test.use({ javaScriptEnabled: false });

  // /xx: a language we don't have (/th is a draft on this build).
  for (const path of ["/no-such-page", "/xx"]) {
    test(path, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(404);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
      await expect(page.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
      await expect(page.getByRole("link", { name: "Support" })).toHaveAttribute("href", "/support");
      await expect(page).toHaveTitle("Page not found · Moodbow");
      await expect(page.getByText("This page doesn't exist or has moved.")).toBeVisible();
    });
  }
});

// Auth email links (W5). Real tokens are tested on the Preview (staging);
// here the build has no Supabase env, so every link fails closed.
test.describe("auth links", () => {
  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });
    test("the confirm button still works (no Origin: null 500)", async ({ page }) => {
      await page.goto("/auth/confirm?token_hash=a1b2c3d4e5f60718293a4b5c6d7e8f90&type=signup");
      const [response] = await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.getByRole("button", { name: "Confirm email" }).click()]);
      expect(response.status()).toBeLessThan(500);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link has expired or was already used.");
    });
  });

  test("/auth/confirm shows one button; only the click verifies (no env here → expired, clean URL)", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=a1b2c3d4e5f60718293a4b5c6d7e8f90&type=signup");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Confirm your email");
    await expect(page.getByText("One tap and your Moodbow journal is ready.")).toBeVisible();
    await page.getByRole("button", { name: "Confirm email" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link has expired or was already used.");
    await expect(page).toHaveURL(/\/email-confirmed$/);
  });

  test("/auth/confirm copy per type, and bad links show the expired copy", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=a1b2c3d4e5f60718293a4b5c6d7e8f90&type=recovery");
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
    await page.goto("/auth/confirm?token_hash=a1b2c3d4e5f60718293a4b5c6d7e8f90&type=email_change");
    // Neutral for a first email (an app backup) and a change alike (UX, decision 216).
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Confirm your email");
    await expect(page.getByRole("button", { name: "Confirm email" })).toBeVisible();
    await page.goto("/auth/confirm?type=signup");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link has expired or was already used.");
    await expect(page.getByRole("button")).toHaveCount(0);
  });

  test("every page: origin-only referrers (decision 79), never framed, no sniffing", async ({ request }) => {
    for (const path of ["/", "/support", "/sign-in", "/welcome", "/email-confirmed?code=abc"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.headers()["referrer-policy"], path).toBe("strict-origin");
      expect(res.headers()["x-frame-options"], path).toBe("DENY");
      expect(res.headers()["x-content-type-options"], path).toBe("nosniff");
    }
  });

  test("/auth/confirm: GET is a plain page, origin-only referrers, noindex", async ({ request, page }) => {
    const res = await request.get("/auth/confirm?token_hash=a1b2c3d4e5f60718293a4b5c6d7e8f90&type=signup", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["referrer-policy"]).toBe("strict-origin");
    await page.goto("/auth/confirm?token_hash=a1b2c3d4e5f60718293a4b5c6d7e8f90&type=signup");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  });

  test("/auth/reset-password without the recovery session shows the expired copy", async ({ page }) => {
    await page.goto("/auth/reset-password");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link has expired or was already used.");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  });

  test("/auth/reset-password?status=changed shows the success copy", async ({ page }) => {
    await page.goto("/auth/reset-password?status=changed");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Password changed");
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(page.getByTestId("reset-done")).toHaveText(
      "Your password was changed, and you've been signed out on all your devices. Sign in with your new password in the app or on the web.",
    );
  });

  test("email change results", async ({ page }, testInfo) => {
    await page.goto("/email-confirmed?result=email_changed");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your email address is confirmed.");
    await expect(page.getByText("Use it next time you sign in.", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/email-confirmed$/);
    // Stays put: no countdown into the web journal (decision 216, UX).
    await expect(page.getByTestId("email-confirmed-countdown")).toHaveCount(0);
    // Back to the app (app-open-link met, 0.9.3 (4)): "Open Moodbow" on
    // Android (the mobile project is a Pixel 7), the line everywhere else.
    if (testInfo.project.name === "mobile") {
      await expect(page.getByTestId("email-confirmed-open-app")).toHaveText("Open Moodbow");
      await expect(page.getByTestId("email-confirmed-open-app")).toHaveAttribute("href", /^intent:\/\/app\/me\/backup#Intent;scheme=moodbow;package=com\.burrowsoft\.moodbow(\.staging)?;/);
      // No app: back to this page on this host (not Play while it isn't public).
      const href = (await page.getByTestId("email-confirmed-open-app").getAttribute("href")) ?? "";
      const fallback = decodeURIComponent(/S\.browser_fallback_url=([^;]+)/.exec(href)?.[1] ?? "");
      expect(fallback).toBe(`${new URL(page.url()).origin}/email-confirmed?result=email_changed&app=missing`);
      await expect(page.getByTestId("email-confirmed-app-line")).toHaveCount(0);
    } else {
      await expect(page.getByTestId("email-confirmed-app-line")).toHaveText("Open the Moodbow app to finish backing up.");
      await expect(page.getByTestId("email-confirmed-open-app")).toHaveCount(0);
    }
    // Back as that fallback: only the confirmation, on every device (UX).
    await page.goto("/email-confirmed?result=email_changed&app=missing");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your email address is confirmed.");
    await expect(page.getByText("Use it next time you sign in.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("email-confirmed-open-app")).toHaveCount(0);
    await expect(page.getByTestId("email-confirmed-app-line")).toHaveCount(0);
    await page.goto("/email-confirmed?result=email_change_pending");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Almost done.");
  });
});

// The web journal shell (W0), behind web-journal-live (drafts on test
// builds). No Supabase env here: signed-out paths and fail-closed errors.
// Signed-in rows run on the Preview against staging.
test.describe("web journal (signed out)", () => {
  test("/app sends a signed-out visitor to sign-in", async ({ page }) => {
    await page.goto("/app/me");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome back");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  });

  test("sign-in validates the email, then fails closed", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("whatever-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("signin-error")).toHaveText("Enter a valid email");
    await page.getByLabel("Email").fill("w0@example.invalid");
    await page.getByLabel("Password").fill("whatever-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("signin-error")).toHaveText("Something went wrong. Please try again.");
  });

  test("forgot password: link from sign-in, validation, always the neutral answer", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reset your password");
    await page.getByLabel("Email").fill("nope");
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(page.getByTestId("forgot-error")).toHaveText("Enter a valid email");
    await page.getByLabel("Email").fill("w0@example.invalid");
    await page.getByRole("button", { name: "Send link" }).click();
    // Always the neutral answer (no account enumeration), even without Supabase.
    await expect(page.getByTestId("reset-sent")).toHaveText("If an account exists for w0@example.invalid, a link is on its way.");
    await expect(page.getByTestId("reset-sent-hint")).toHaveText("Didn't get it? Check your spam folder, or try again in a few minutes.");
  });
});

// #248: help is on the safety path, so it can't wait for the page's scripts, or need them at all.
test.describe("help with no script at all", () => {
  test.use({ javaScriptEnabled: false });
  for (const [path, id] of [["/sign-in", "sign-in-get-help"], ["/forgot-password", "forgot-get-help"], ["/consent", "consent-get-help"]]) {
    for (const language of ["", "/fr", "/es", "/pt-br"]) {
      test(`${language}${path}: the help button leads to a page with the way to a helpline`, async ({ page }) => {
        await page.goto(`${language}${path}`);
        await page.getByTestId(id).click();
        await expect(page).toHaveURL(new RegExp(`${language}/help/get-help-now$`));
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator("[data-content=article]")).not.toBeEmpty();
        await expect(page.getByTestId("help-now-find-helpline")).toHaveAttribute("href", /^https:/);
      });
    }
  }
});

// Onboarding (W0 part 2), signed out, no Supabase env. The account-creating
// and signed-in rows run on the Preview against staging.
test.describe("onboarding (signed out)", () => {
  for (const [path, id] of [["/sign-in", "sign-in-get-help"], ["/forgot-password", "forgot-get-help"]]) {
    test(`${path}: help is there signed out, and it opens the card with the directory`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId(id)).toHaveText("Want to talk to someone?");
      await page.getByTestId(id).click();
      await expect(page.getByTestId("safety-card")).toBeVisible();
      await expect(page.getByTestId("safety-find-helpline")).toBeVisible();
      await page.getByTestId("safety-close").click();
      await expect(page.getByTestId("safety-card")).toHaveCount(0);
    });
  }

  test("/security: a 404 with no update out, in any language, and Home doesn't link to it", async ({ page }) => {
    for (const path of ["/security", "/es/security"]) expect((await page.goto(path))?.status(), path).toBe(404);
    await page.goto("/");
    await expect(page.getByTestId("home-security")).toHaveCount(0);
  });

  test("Consent: help is there before anything's agreed, and it opens the card", async ({ page }) => {
    await page.goto("/consent");
    // Help first, then who keeps what, then the boxes (UX).
    const help = (await page.getByTestId("consent-get-help").boundingBox())!;
    const notice = (await page.getByTestId("consent-notice").boundingBox())!;
    const form = (await page.getByTestId("consent-privacy").boundingBox())!;
    expect(help.y).toBeLessThan(notice.y);
    expect(notice.y).toBeLessThan(form.y);
    await expect(page.getByTestId("consent-notice")).toContainText("Moodbow is run by Vitor Ribeiro Carvalho");
    await page.getByTestId("consent-get-help").click();
    await expect(page.getByTestId("safety-card")).toBeVisible();
    await expect(page.getByTestId("safety-find-helpline")).toBeVisible();
    await page.getByTestId("safety-close").click();
    await expect(page.getByTestId("safety-card")).toHaveCount(0);
    await expect(page.getByTestId("consent-privacy")).toBeVisible();
  });

  test("welcome: Next, Skip to slide 3, Get started → Consent; Back from Consent → slide 3", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.getByTestId("welcome-slide-1")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("A private journal for your days");
    await page.getByTestId("welcome-next").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("See your patterns");
    await page.getByTestId("welcome-skip").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Private, and yours");
    await expect(page.getByText("Your journal is private to your account, and you can delete everything in Me.")).toBeVisible();
    await expect(page.getByTestId("welcome-skip")).toHaveCount(0);
    await expect(page).toHaveURL(/\/welcome\?slide=3$/);
    await page.getByTestId("welcome-start").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Before you start");
    await page.getByTestId("consent-back").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Private, and yours");
  });

  test("browser Back from Consent lands on slide 3 too", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByTestId("welcome-skip").click();
    await page.getByTestId("welcome-start").click();
    await expect(page).toHaveURL(/\/consent$/);
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Private, and yours");
  });

  test("consent: Continue only with both boxes; the AI box optional; then Create account", async ({ page }) => {
    await page.goto("/consent");
    const cont = page.getByTestId("consent-continue");
    await expect(cont).toBeDisabled();
    await page.getByTestId("consent-privacy").check();
    await expect(cont).toBeDisabled();
    await page.getByTestId("consent-health").check();
    // This build shows drafts, so ai-live is a draft and the optional AI box
    // is there (#60; hidden on Production until ai-live is met): unticked,
    // never required, and Continue doesn't wait for it.
    const ai = page.getByTestId("consent-ai");
    await expect(ai).toBeVisible();
    await expect(ai).not.toBeChecked();
    await expect(page.getByText("AI reflections and reports (optional)")).toBeVisible();
    await expect(cont).toBeEnabled();
    await cont.click();
    await expect(page).toHaveURL(/\/sign-up$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your account");
    await expect(page.getByRole("contentinfo").locator('a[href$="/consumer-health-data"]'), "sign-up has the health data link").toBeVisible();
  });

  // Decision 73: the whole way to an account works before JavaScript loads
  // (or without it): real links and native forms, server-rendered steps.
  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("welcome → consent → sign-up, and the form answers", async ({ page }) => {
      await page.goto("/welcome");
      await page.getByTestId("welcome-next").click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("See your patterns");
      await page.getByTestId("welcome-back").click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("A private journal for your days");
      await page.getByTestId("welcome-skip").click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Private, and yours");
      await page.getByTestId("welcome-start").click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Before you start");

      // Continue is enabled without JS; the browser's required check stops
      // an incomplete form (no request is sent).
      const cont = page.getByTestId("consent-continue");
      await expect(cont).toBeEnabled();
      await cont.click();
      await expect(page).toHaveURL(/\/consent$/);
      await page.getByTestId("consent-privacy").check();
      await page.getByTestId("consent-health").check();
      await cont.click();
      await expect(page).toHaveURL(/\/sign-up$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your account");

      // A native POST: the server answers with the page (here: no Supabase,
      // so it fails closed with the validation message first).
      await page.getByLabel("Email").fill("nope");
      await page.getByLabel("Password").fill("secret-123");
      const [response] = await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.getByTestId("signup-submit").click()]);
      expect(response.status()).toBeLessThan(500);
      await expect(page.getByTestId("signup-error")).toHaveText("Enter a valid email");
    });

    test("sign-in: a native POST, and the server answers (then fails closed)", async ({ page }) => {
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill("not-an-email");
      await page.getByLabel("Password").fill("whatever-123");
      const [first] = await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.getByRole("button", { name: "Sign in" }).click()]);
      expect(first.status()).toBeLessThan(500);
      await expect(page.getByTestId("signin-error")).toHaveText("Enter a valid email");
      // The typed email comes back in the server-rendered form.
      await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
      await page.getByLabel("Email").fill("w0@example.invalid");
      await page.getByLabel("Password").fill("whatever-123");
      const [second] = await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.getByRole("button", { name: "Sign in" }).click()]);
      expect(second.status()).toBeLessThan(500);
      await expect(page.getByTestId("signin-error")).toHaveText("Something went wrong. Please try again.");
    });
  });

  test("sign-up without consent → Consent", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page).toHaveURL(/\/consent$/);
  });

  test("sign-up validation, then fail closed without Supabase", async ({ page }) => {
    await page.goto("/consent");
    await page.getByTestId("consent-privacy").check();
    await page.getByTestId("consent-health").check();
    await page.getByTestId("consent-continue").click();
    await expect(page).toHaveURL(/\/sign-up$/);
    // Decision 216: live since anon-start-live (0.9.4).
    await expect(page.getByTestId("auth-started-in-app")).toHaveText("Started in the app? Back up your journal there first, then sign in here with that email.");
    await page.getByLabel("Email").fill("nope");
    await page.getByLabel("Password").fill("secret-123");
    await page.getByTestId("signup-submit").click();
    await expect(page.getByTestId("signup-error")).toHaveText("Enter a valid email");
    await page.getByLabel("Email").fill("w0@example.invalid");
    await page.getByLabel("Password").fill("short");
    await page.getByTestId("signup-submit").click();
    await expect(page.getByTestId("signup-error")).toHaveText("Use at least 8 characters");
    await page.getByLabel("Password").fill("secret-123");
    await page.getByTestId("signup-submit").click();
    await expect(page.getByTestId("signup-error")).toHaveText("Moodbow is for people 18 and older");
    await page.getByTestId("signup-age").check();
    await page.getByTestId("signup-submit").click();
    await expect(page.getByTestId("signup-error")).toHaveText("Something went wrong. Please try again.");
  });

  test("sign-in links to Create account (Welcome); setup needs a session", async ({ page }) => {
    await page.goto("/sign-in");
    // Decision 216: live since anon-start-live (0.9.4).
    await expect(page.getByTestId("auth-started-in-app")).toHaveText("Started in the app? Back up your journal there first, then sign in here with that email.");
    await page.getByTestId("signin-to-signup").click();
    await expect(page).toHaveURL(/\/welcome$/);
    await page.goto("/setup");
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

test("sign-in shows the notice for why the session ended (decisions 68 + 70)", async ({ page }) => {
  await page.goto("/sign-in?signed_out=account");
  await expect(page.getByTestId("signed-out-notice")).toHaveText("You've been signed out. If you deleted your account, everything in it is gone.");
  await page.goto("/sign-in?signed_out=session");
  await expect(page.getByTestId("signed-out-notice")).toHaveText("You've been signed out. Please sign in again.");
  await page.goto("/sign-in");
  await expect(page.getByTestId("signed-out-notice")).toHaveCount(0);
});
