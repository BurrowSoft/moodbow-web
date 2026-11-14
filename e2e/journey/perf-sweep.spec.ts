import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { cleanup, configured, confirmEmail, newEmail, newPassword, notConfigured, signedUpUnconfirmed } from "./staging";

// THROWAWAY (never merged): first-load JS per route, for UX's 1.3.0 performance check. Each
// route opens in a fresh context (no cache) with the signed-in cookies; every script response
// is counted by its compressed body size, and each script is checked for fflate's unique
// error text ("date not in range 1980-2099"), which shows if the zip library loads up front.
test.skip(!configured, notConfigured);

type Row = { route: string; scripts: number; kb: number; fflate: boolean; unread: number };

async function measure(browser: Browser, state: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined, url: string, label: string): Promise<Row> {
  const context = await browser.newContext(state ? { storageState: state } : {});
  const page = await context.newPage();
  const pending: Promise<{ size: number; fflate: boolean }>[] = [];
  page.on("response", (res) => {
    if (res.request().resourceType() !== "script") return;
    const read = (async () => {
      const sizes = await res.request().sizes().catch(() => ({ responseBodySize: 0 }));
      const body = await res.text().catch(() => "");
      return { size: sizes.responseBodySize, fflate: body.includes("date not in range 1980-2099") };
    })();
    // A script that never finishes can't hold the sweep: 15 s each, then counted as unread (-1).
    pending.push(Promise.race([read, new Promise<{ size: number; fflate: boolean }>((done) => setTimeout(() => done({ size: -1, fflate: false }), 15_000))]));
  });
  await page.goto(url, { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const landed = new URL(page.url()).pathname;
  const all = await Promise.all(pending);
  await context.close();
  const row = { route: `${label} (${landed})`, scripts: all.length, kb: Math.round(all.reduce((n, r) => n + Math.max(r.size, 0), 0) / 102.4) / 10, fflate: all.some((r) => r.fflate), unread: all.filter((r) => r.size < 0).length };
  console.log(`PERF ${JSON.stringify(row)}`);
  return row;
}

test("first-load JS per route (throwaway perf sweep)", async ({ browser }) => {
  test.setTimeout(300_000);
  const email = newEmail();
  const password = newPassword();
  try {
    // With the consents, as the launch journeys make their accounts (createConfirmedUser has none).
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    // master signs in to Setup; since #314 sign-in lands on Today.
    await page.waitForURL(/\/(setup|app)$/, { timeout: 20_000 });
    if (page.url().endsWith("/setup")) await page.getByTestId("setup-done").click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    // One entry, for the entry view.
    await page.goto("/app/write");
    await page.getByTestId("entry-text").fill("A quiet afternoon by the river.");
    await page.getByTestId("entry-save").click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await page.locator('[data-testid^="today-entry-"]').first().click();
    await expect(page).toHaveURL(/\/app\/entries\/[0-9a-f-]{36}/, { timeout: 20_000 });
    const entry = new URL(page.url()).pathname;
    const state = await context.storageState();
    await context.close();

    const rows: Row[] = [];
    for (const [label, url] of [["Today", "/app"], ["Timeline", "/app/timeline"], ["Insights", "/app/insights"], ["Me", "/app/me"], ["Entry view", entry], ["Write", "/app/write"]] as const) {
      rows.push(await measure(browser, state, url, label));
    }
    rows.push(await measure(browser, undefined, "/sign-up", "Sign-up (signed out)"));
    rows.push(await measure(browser, undefined, "/", "Home (signed out)"));
    expect(rows.length).toBe(8);
  } finally {
    await cleanup(email);
  }
});
