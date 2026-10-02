import { expect, test } from "@playwright/test";

// Smoke tests for the public site. They expect a test build, where gated
// pages render as drafts: a Vercel Preview, or a local/CI build made with
// NEXT_PUBLIC_SHOW_DRAFTS=1 npm run build. Everywhere else gated pages are
// 404s (fail closed), pinned by the pageGate unit tests.

const CANONICAL = "https://www.moodbow.com";

test.describe("home", () => {
  test("English at /", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Moodbow — A journal that learns your story");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("A journal that learns your story.");
    await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();
    const notify = page.getByRole("link", { name: "Get notified by email when Moodbow launches" });
    await expect(notify).toHaveAttribute("href", "mailto:support@moodbow.com?subject=Notify%20me%20about%20Moodbow");
    await expect(page.getByText("Email us and we'll let you know when it's ready.")).toBeVisible();
    await expect(page.getByText("We'll email you once", { exact: false })).toHaveCount(0);
    for (const title of ["Seconds a day", "See your patterns", "Private, and yours"]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    // welcome3BodyNoAi: no AI claim while AI isn't live.
    await expect(page.getByText("Only you can read your journal, and you can delete everything at any time.")).toBeVisible();
    await expect(page.getByText(/\bAI\b/)).toHaveCount(0);
  });

  test("SEO tags use the www canonical host", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", CANONICAL);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", CANONICAL);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${CANONICAL}/og-image.png`);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", CANONICAL);
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", CANONICAL);
    await expect(page.locator('link[rel="alternate"][hreflang="th"]')).toHaveCount(0);
    await page.goto("/support");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${CANONICAL}/support`);
  });

  test("the og image and icons are served", async ({ request }) => {
    for (const path of ["/og-image.png", "/favicon.ico", "/favicon.svg", "/apple-touch-icon.png", "/manifest.webmanifest"]) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
  });
});

test.describe("language (English-only beta)", () => {
  test("a Thai browser stays on English at /", async ({ browser }) => {
    const context = await browser.newContext({ locale: "th-TH" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await context.close();
  });

  test("/th is not a route yet, and there is no language switcher", async ({ page }) => {
    const res = await page.goto("/th");
    expect(res?.status()).toBe(404);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Language" })).toHaveCount(0);
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

test.describe("gated pages render as drafts outside Production", () => {
  for (const [path, heading] of [
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms of use"],
    ["/account-deletion", "Delete your Moodbow account"],
  ] as const) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.getByTestId("draft-banner")).toBeVisible();
      await expect(page.locator('[data-content="article"]')).toHaveCount(1);
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
    await expect(page.getByRole("link", { name: "support@moodbow.com" })).toHaveAttribute("href", "mailto:support@moodbow.com");
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
    expect(body).toContain(`<loc>${CANONICAL}/support</loc>`);
    for (const hidden of ["privacy", "terms", "account-deletion", "email-confirmed", "/th"]) {
      expect(body, hidden).not.toContain(hidden);
    }
  });
});

test("unknown pages are a 404 with the site's not-found page", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
});

test.describe("404s are server-rendered (no JS)", () => {
  test.use({ javaScriptEnabled: false });

  for (const path of ["/no-such-page", "/th"]) {
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
    await expect(page.getByRole("button", { name: "Confirm email change" })).toBeVisible();
    await page.goto("/auth/confirm?type=signup");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link has expired or was already used.");
    await expect(page.getByRole("button")).toHaveCount(0);
  });

  test("/auth/confirm: GET is a plain page with no-referrer and noindex", async ({ request, page }) => {
    const res = await request.get("/auth/confirm?token_hash=a1b2c3d4e5f60718293a4b5c6d7e8f90&type=signup", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["referrer-policy"]).toBe("no-referrer");
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
    await expect(page.getByTestId("reset-done")).toHaveText(
      "Your password was changed, and you've been signed out on all your devices. Sign in with your new password in the app or on the web.",
    );
  });

  test("email change results", async ({ page }) => {
    await page.goto("/email-confirmed?result=email_changed");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your email address was updated.");
    await expect(page.getByText("Use the new one next time you sign in.")).toBeVisible();
    await expect(page).toHaveURL(/\/email-confirmed$/);
    await page.goto("/email-confirmed?result=email_change_pending");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Almost done.");
  });
});
