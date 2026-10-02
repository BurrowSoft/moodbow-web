import { expect, test } from "@playwright/test";

// Smoke tests for the public site. They run against a build without
// NEXT_PUBLIC_VERCEL_ENV=production (local, CI, a Preview), where gated
// pages render as drafts. Production's 404s for gated pages are pinned by
// the pageGate unit tests.

const CANONICAL = "https://www.moodbow.com";

test.describe("home", () => {
  test("English at /", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Moodbow — A journal that learns your story");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("A journal that learns your story.");
    await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();
    const notify = page.getByRole("link", { name: "Get notified by email when Moodbow launches" });
    await expect(notify).toHaveAttribute("href", "mailto:support@burrowsoft.com?subject=Notify%20me%20about%20Moodbow");
    for (const title of ["A journal that learns your story", "See your patterns", "Private, and yours"]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    // welcome3BodyNoAi: no AI claim while AI isn't live.
    await expect(page.getByText("Only you can read your journal, and you can delete everything at any time.")).toBeVisible();
    await expect(page.getByText(/\bAI\b/)).toHaveCount(0);
  });

  test("Thai at /th", async ({ page }) => {
    await page.goto("/th");
    await expect(page.locator("html")).toHaveAttribute("lang", "th");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ไดอารี่ที่เรียนรู้เรื่องราวของคุณ");
    await expect(page.getByText("เร็วๆ นี้", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "เห็นรูปแบบของตัวเอง" })).toBeVisible();
  });

  test("SEO tags use the www canonical host", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", CANONICAL);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", CANONICAL);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${CANONICAL}/og-image.png`);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator('link[rel="alternate"][hreflang="th"]')).toHaveAttribute("href", `${CANONICAL}/th`);
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", CANONICAL);
    await page.goto("/th");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${CANONICAL}/th`);
  });

  test("the og image and icons are served", async ({ request }) => {
    for (const path of ["/og-image.png", "/favicon.ico", "/favicon.svg", "/apple-touch-icon.png", "/manifest.webmanifest"]) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
  });
});

test.describe("language", () => {
  test("a Thai browser is sent to /th on its first visit", async ({ browser }) => {
    const context = await browser.newContext({ locale: "th-TH" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/th$/);
    await context.close();
  });

  test("the switcher changes language and the choice sticks", async ({ page }) => {
    await page.goto("/support");
    await page.getByRole("navigation", { name: "Language" }).getByRole("link", { name: "ไทย" }).click();
    await expect(page).toHaveURL(/\/th\/support$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ช่วยเหลือ");
    await page.goto("/");
    await expect(page).toHaveURL(/\/th$/);
    await page.getByRole("navigation", { name: "ภาษา" }).getByRole("link", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("A journal that learns your story.");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("support", () => {
  test("shows the support email", async ({ page }) => {
    await page.goto("/support");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Support");
    await expect(page.getByRole("link", { name: "support@burrowsoft.com" })).toHaveAttribute("href", "mailto:support@burrowsoft.com");
  });
});

test.describe("gated pages render as drafts outside Production", () => {
  for (const [path, heading] of [
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms of use"],
    ["/account-deletion", "Delete your Moodbow account"],
    ["/th/account-deletion", "ลบบัญชี Moodbow ของคุณ"],
  ] as const) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.getByTestId("draft-banner")).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    });
  }

  test("gated pages are not linked from the footer", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Support" })).toBeVisible();
    for (const name of ["Privacy", "Terms", "Delete your account"]) {
      await expect(footer.getByRole("link", { name })).toHaveCount(0);
    }
  });

  test("account deletion: the PM's copy, support email, no backups line yet", async ({ page }) => {
    await page.goto("/account-deletion");
    await expect(page.getByText("In the app or on the web: open Me → Delete account, type DELETE, and confirm.")).toBeVisible();
    await expect(page.getByRole("link", { name: "support@burrowsoft.com" })).toHaveAttribute("href", "mailto:support@burrowsoft.com");
    await expect(page.getByTestId("backups-line")).toHaveCount(0);
  });
});

test.describe("email confirmed", () => {
  test("success", async ({ page }) => {
    await page.goto("/email-confirmed");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Email confirmed.");
    await expect(page.getByText("Open Moodbow to continue.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue on the web" })).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  });

  test("an expired link shows the error and the token is removed from the URL", async ({ page }) => {
    await page.goto("/th/email-confirmed?code=abc#error=access_denied&error_code=otp_expired&error_description=expired");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว");
    await expect(page).toHaveURL(/\/th\/email-confirmed$/);
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

  test("robots.txt points to the sitemap", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("Allow: /");
    expect(body).toContain(`Sitemap: ${CANONICAL}/sitemap.xml`);
  });

  test("sitemap.xml lists only live pages", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain(`<loc>${CANONICAL}/</loc>`);
    expect(body).toContain(`<loc>${CANONICAL}/th/support</loc>`);
    for (const hidden of ["privacy", "terms", "account-deletion", "email-confirmed"]) {
      expect(body, hidden).not.toContain(hidden);
    }
  });
});

test("unknown pages are a localized 404", async ({ page }) => {
  const res = await page.goto("/th/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ไม่พบหน้านี้");
});
