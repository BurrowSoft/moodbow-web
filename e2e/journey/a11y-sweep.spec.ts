import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { cleanup, configured, confirmEmail, grantPlusTrial, newEmail, newPassword, notConfigured, plusOnStaging, signedUpUnconfirmed } from "./staging";

// THROWAWAY (trial/a11y-letters, never merged; UX 14 Nov): the 1.3 part-3 a11y sweep for #319's
// letter editor with reminders (not in the stack trial, #326). Every axe violation, any impact, is
// logged as one "A11Y|screen|theme|impact|rule|count|targets" line, at 320 px with text at 300 %,
// in light and dark. A report, not a gate: it fails only if a screen can't be reached.
test.skip(!configured, notConfigured);

async function sweepOne(page: Page, screen: string, open: () => Promise<void>): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await open();
    await page.waitForTimeout(400);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    for (const v of violations) console.log(`A11Y|${screen}|${theme}|${v.impact ?? "?"}|${v.id}|${v.nodes.length}|${v.nodes.map((n) => n.target.join(" ")).slice(0, 6).join(" ; ")}`);
    if (overflow > 0) console.log(`A11Y|${screen}|${theme}|layout|sideways-scroll|1|${overflow}px`);
    console.log(`A11Y-DONE|${screen}|${theme}|violations ${violations.length}|overflow ${overflow}`);
  }
}

test("a11y sweep: the letter editor with reminders, light and dark, 320 px at 300 %", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Page.setFontSizes is Chromium's");
  test.setTimeout(300_000);
  expect(await plusOnStaging(), "staging has 028's entitlements").toBe(true);
  const email = newEmail();
  const password = newPassword();
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/(app|setup)$/, { timeout: 20_000 });
    if (page.url().endsWith("/setup")) await page.getByTestId("setup-done").click();
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    await grantPlusTrial(email);
    await page.setViewportSize({ width: 320, height: 640 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });
    await sweepOne(page, "Letter editor", async () => {
      await page.goto("/app/me/letters");
      await expect(page.getByTestId("letter-text")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("letter-reminders")).toBeVisible();
    });
    await sweepOne(page, "Letter editor (a heads-up added)", async () => {
      await page.goto("/app/me/letters");
      await expect(page.getByTestId("letter-reminders")).toBeVisible({ timeout: 15_000 });
      const before = await page.getByTestId("letter-reminder").count();
      await page.getByTestId("letter-reminder-add").click();
      await expect(page.getByTestId("letter-reminder")).toHaveCount(before + 1);
    });
  } finally {
    await cleanup(email);
  }
});
