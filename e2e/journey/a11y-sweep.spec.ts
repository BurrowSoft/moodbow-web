import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addPicture, cleanup, configured, confirmEmail, grantPlusTrial, journalToday, lastWeekMonday, newEmail, newPassword, notConfigured, picturesOnStaging, plusOnStaging, seedCheckIns, seedMoment, signedUpUnconfirmed, userSession } from "./staging";

// THROWAWAY (trial/a11y-13p3, never merged; UX 14 Nov): an accessibility sweep of the 1.3 part-3
// screens with the whole stack merged. Every axe violation, any impact, is logged as one
// "A11Y|screen|theme|impact|rule|count|targets" line, at 320 px with text at 300 %, in light and
// dark. A report, not a gate: the test fails only if a screen can't be reached (never a skip).
test.skip(!configured, notConfigured);

type Found = { screen: string; theme: string; impact: string; rule: string; count: number; targets: string };
const found: Found[] = [];
const swept: string[] = [];

async function sweepOne(page: Page, screen: string, open: () => Promise<void>): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await open();
    // Settled: fonts and any transition finished before axe reads colours.
    await page.waitForTimeout(400);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    for (const v of violations) {
      const f = { screen, theme, impact: v.impact ?? "?", rule: v.id, count: v.nodes.length, targets: v.nodes.map((n) => n.target.join(" ")).slice(0, 6).join(" ; ") };
      found.push(f);
      console.log(`A11Y|${f.screen}|${f.theme}|${f.impact}|${f.rule}|${f.count}|${f.targets}`);
    }
    if (overflow > 0) console.log(`A11Y|${screen}|${theme}|layout|sideways-scroll|1|${overflow}px`);
    console.log(`A11Y-DONE|${screen}|${theme}|violations ${violations.length}|overflow ${overflow}`);
    swept.push(`${screen} (${theme})`);
  }
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("main form button[type=submit]").first().click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
}

test("a11y sweep: 1.3 part 3 screens, light and dark, 320 px at 300 %", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Page.setFontSizes is Chromium's");
  test.setTimeout(600_000);
  expect(await plusOnStaging(), "staging has 028's entitlements").toBe(true);
  expect(await picturesOnStaging(), "staging has 035").toBe(true);
  const email = newEmail();
  const password = newPassword();
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await signIn(page, email, password);
    // Last week: a calm pattern (not a hard week), so Today shows Your week and the Plus card.
    const monday = await lastWeekMonday(email);
    await seedCheckIns(email, password, monday, [
      { offset: 0, mood: 5, sleep_hours: 8 },
      { offset: 1, mood: 5, sleep_hours: 8 },
      { offset: 2, mood: 4, sleep_hours: 7 },
      { offset: 3, mood: 3, sleep_hours: 5 },
      { offset: 4, mood: 4, sleep_hours: 6 },
    ]);
    await page.setViewportSize({ width: 320, height: 640 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });

    // Free.
    await sweepOne(page, "Today (Your week + Plus card)", async () => {
      await page.goto("/app");
      await expect(page.getByTestId("your-week")).toBeVisible({ timeout: 15_000 });
      console.log(`A11Y-NOTE|Today|today-plus-card present: ${await page.getByTestId("today-plus-card").count()}`);
    });
    await sweepOne(page, "Plus screen (free)", async () => {
      await page.goto("/app/me/plus");
      await expect(page.getByTestId("plus-screen")).toBeVisible({ timeout: 15_000 });
    });
    for (const range of ["week", "month", "3months", "year"]) {
      await sweepOne(page, `Insights example (${range})`, async () => {
        await page.goto("/app/insights");
        await page.getByTestId(`insights-example-range-${range}`).click();
        await expect(page.getByTestId(`insights-example-range-${range}`)).toHaveAttribute("aria-pressed", "true");
      });
    }
    // Me with its picture (kept in this browser).
    await page.goto("/app/me");
    await page.getByTestId("me-picture-input").setInputFiles({ name: "walk.jpg", mimeType: "image/jpeg", buffer: await readFile("src/lib/journal/__fixtures__/chromium-canvas.jpg") });
    await expect(page.getByTestId("me-picture-img")).toBeVisible({ timeout: 15_000 });
    await sweepOne(page, "Me (picture card)", async () => {
      await page.goto("/app/me");
      await expect(page.getByTestId("me-picture-img")).toBeVisible({ timeout: 15_000 });
    });

    // Plus: a moment with a picture.
    await grantPlusTrial(email);
    await sweepOne(page, "Plus screen (free week)", async () => {
      await page.goto("/app/me/plus");
      await expect(page.getByTestId("plus-screen")).toBeVisible({ timeout: 15_000 });
    });
    const today = await journalToday(email, password);
    const moment = await seedMoment(email, password, today, "A walk by the sea, then tea.");
    const session = await userSession(email, password);
    await addPicture(session, moment, new Uint8Array(await readFile("src/lib/journal/__fixtures__/chromium-canvas.jpg")));
    await sweepOne(page, "Entry view (picture, recall, ✎)", async () => {
      await page.goto(`/app/entries/${moment}`);
      await expect(page.getByTestId("entry-picture")).toHaveCount(1, { timeout: 15_000 });
      await expect(page.getByTestId("entry-recall")).toBeVisible();
      await expect(page.getByTestId("entry-view-edit")).toBeVisible();
    });
    await sweepOne(page, "Timeline (picture strip)", async () => {
      await page.goto("/app/timeline");
      await expect(page.getByTestId("timeline-picture").first()).toBeVisible({ timeout: 15_000 });
    });
    await sweepOne(page, "Calendar (with key)", async () => {
      await page.goto("/app/timeline");
      await page.getByTestId("timeline-view-calendar").click();
      await expect(page.getByTestId("month-calendar")).toBeVisible();
      await expect(page.getByTestId("calendar-key")).toBeVisible();
    });
  } finally {
    await cleanup(email);
    const byRule = new Map<string, number>();
    for (const f of found) byRule.set(`${f.impact} ${f.rule}`, (byRule.get(`${f.impact} ${f.rule}`) ?? 0) + f.count);
    console.log(`A11Y-SUMMARY|swept ${swept.length}: ${swept.join(", ")}`);
    console.log(`A11Y-SUMMARY|by rule: ${[...byRule].map(([k, n]) => `${k} ×${n}`).join(", ") || "none"}`);
  }
});
