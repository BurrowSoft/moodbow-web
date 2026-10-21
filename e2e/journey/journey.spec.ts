import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import messages from "../../src/messages/en.json";
import { aiAvailable, cleanup, configured, confirmEmail, exists, newEmail, newPassword, notConfigured, sweep } from "./staging";

// The launch-critical journeys (1.0), end to end against staging with a
// throwaway account each: sign-up → confirm → consent → setup → check-in →
// entry → Timeline → Insights → export → delete account; and the AI-on
// path through setup's focus and tone. Run by the CI "journeys" job (its own
// build, pointed at staging); skipped where the staging secrets aren't set.
test.skip(!configured, notConfigured);
test.describe.configure({ timeout: 90_000 });

test.beforeAll(async () => {
  await sweep();
});

const ENTRY = "A calm walk by the river after work, then tea with a friend.";

// Welcome → Consent (AI as asked) → Sign-up → confirmed → Setup.
async function signUp(page: Page, email: string, { ai }: { ai: boolean }): Promise<string> {
  const password = newPassword();
  await page.goto("/welcome?slide=3");
  await page.getByTestId("welcome-start").click();
  await expect(page).toHaveURL(/\/consent$/);
  await page.getByTestId("consent-privacy").check();
  await page.getByTestId("consent-health").check();
  if (ai) await page.getByTestId("consent-ai").check();
  else await expect(page.getByTestId("consent-ai")).not.toBeChecked();
  await page.getByTestId("consent-continue").click();

  await expect(page).toHaveURL(/\/sign-up$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByTestId("signup-age").check();
  await page.getByTestId("signup-submit").click();

  // Staging asks for confirmation: confirm through the admin API, then the
  // "I've confirmed" button signs in. (Without confirmation it goes straight on.)
  const checkEmail = page.getByTestId("check-email");
  await expect(checkEmail.or(page.getByRole("heading", { level: 1, name: messages.onboarding.setupTitle }))).toBeVisible({ timeout: 20_000 });
  if (await checkEmail.isVisible()) {
    await confirmEmail(email);
    await page.getByTestId("check-email-confirmed").click();
  }
  await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
  return password;
}

test.describe("launch journeys", () => {
  test("AI off: sign-up to delete account, through every tab and the export", async ({ page }) => {
    const email = newEmail();
    try {
      await signUp(page, email, { ai: false });

      // Setup: no AI, so no focus or tone; just the reminder.
      await expect(page.getByTestId("setup-tone-warm")).toHaveCount(0);
      await expect(page.getByTestId("setup-reminder-time")).toBeVisible();
      await page.getByTestId("setup-done").click();
      await expect(page).toHaveURL(/\/app$/);

      // Today: a check-in.
      await page.getByTestId("checkin-mood-4").click();
      await page.getByTestId("checkin-save").click();
      await expect(page.getByTestId("checkin-status")).toHaveText(messages.today.checkinSaved);
      await expect(page.getByTestId("checkin-summary-mood")).toContainText(messages.today.mood4);

      // An entry, then its view.
      await page.getByTestId("today-write").click();
      await expect(page).toHaveURL(/\/app\/write/);
      await page.getByTestId("entry-text").fill(ENTRY);
      await page.getByTestId("entry-save").click();
      await expect(page).toHaveURL(/\/app$/);
      await page.locator('[data-testid^="today-entry-"]').first().click();
      await expect(page).toHaveURL(/\/app\/entries\/[0-9a-f-]{36}$/);
      await expect(page.getByTestId("entry-body")).toContainText(ENTRY);
      await expect(page.getByTestId("entry-checkin")).toBeVisible();

      // Timeline: today's day, its mood and the entry.
      await page.getByTestId("tab-timeline").click();
      await expect(page).toHaveURL(/\/app\/timeline$/);
      // The day header is a link; the entries are its siblings in the row's <li>.
      const day = page.locator("li").filter({ has: page.locator('[data-testid^="timeline-day-"]') }).first();
      await expect(day.getByTestId("timeline-mood-dot")).toBeVisible();
      await expect(day.locator('[data-testid^="timeline-entry-"]')).toHaveCount(1);

      // Insights: one check-in isn't a chart yet.
      await page.getByTestId("tab-insights").click();
      await expect(page).toHaveURL(/\/app\/insights$/);
      await expect(page.getByTestId("insights-not-enough-mood")).toBeVisible();

      // Me: the export, both files, each with the entry in it.
      await page.getByTestId("tab-me").click();
      await expect(page).toHaveURL(/\/app\/me$/);
      await page.getByTestId("me-export").click();
      await expect(page.getByTestId("me-export-status")).toBeVisible({ timeout: 20_000 });
      for (const [id, name] of [
        ["me-export-txt", /^moodbow-journal-\d{4}-\d{2}-\d{2}\.txt$/],
        ["me-export-json", /^moodbow-export-\d{4}-\d{2}-\d{2}\.json$/],
      ] as const) {
        const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId(id).click()]);
        expect(download.suggestedFilename()).toMatch(name);
        const text = await readFile((await download.path())!, "utf8");
        expect(text).toContain(ENTRY);
        if (id === "me-export-txt") expect(text.startsWith("Moodbow: your journal")).toBe(true);
        else expect(JSON.parse(text)).toMatchObject({ format: "moodbow-export", format_version: 1 });
      }

      // Delete the account: typed confirmation, signed out, and gone.
      await page.getByTestId("me-delete").click();
      const dialog = page.getByTestId("delete-dialog");
      await expect(dialog).toBeVisible();
      await expect(page.getByTestId("delete-confirm")).toBeDisabled();
      await page.getByTestId("delete-confirm-input").fill("DELETE");
      await page.getByTestId("delete-confirm").click();
      await expect(page).toHaveURL(/\/sign-in\?signed_out=deleted$/, { timeout: 20_000 });
      await expect(page.getByTestId("signed-out-notice")).toBeVisible();
      expect(await exists(email)).toBe(false);
    } finally {
      await cleanup(email);
    }
  });

  test("an entry save that never answers: the generic error at the editor's 30 s wait, Save works again, the text is kept (#122 T2b)", async ({ page }) => {
    test.setTimeout(120_000);
    const email = newEmail();
    try {
      await signUp(page, email, { ai: false });
      await page.getByTestId("setup-done").click();
      await expect(page).toHaveURL(/\/app$/);
      await page.getByTestId("today-write").click();
      await expect(page).toHaveURL(/\/app\/write/);

      // Only the Save POST (a server action) is held; every other request goes through.
      const held: (() => Promise<void>)[] = [];
      await page.route(
        (url) => url.pathname.endsWith("/app/write"),
        async (route) => {
          const request = route.request();
          if (request.method() === "POST" && (await request.headerValue("next-action"))) held.push(() => route.abort());
          else await route.continue();
        },
      );
      await page.getByTestId("entry-text").fill(ENTRY);
      const sent = Date.now();
      await page.getByTestId("entry-save").click();
      await expect(page.getByTestId("entry-error")).toHaveText(messages.today.errGeneric, { timeout: 40_000 });
      expect(Date.now() - sent).toBeLessThan(40_000);
      expect(held.length).toBe(1);
      await expect(page.getByTestId("entry-save")).toBeEnabled();
      await expect(page.getByTestId("entry-text")).toHaveValue(ENTRY);
      await expect(page).toHaveURL(/\/app\/write/);
      for (const release of held) await release();
    } finally {
      await cleanup(email);
    }
  });

  test("AI on: consent → setup's focus and tone → Today", async ({ page }) => {
    const email = newEmail();
    try {
      const password = await signUp(page, email, { ai: true });

      // Focus and tone also need staging's global AI switch, which is off
      // outside AI windows (decision 123): read it as the app does, and skip
      // rather than fail while it's off.
      test.skip(!(await aiAvailable(email, password)), "staging's AI switch is off (get_me().ai_available false): AI-on journey skipped");
      const sleep = page.getByTestId("setup-focus-sleep");
      await expect(sleep).toHaveAttribute("aria-pressed", "false");
      await sleep.click();
      await expect(sleep).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("setup-focus-work").click();
      await expect(page.getByTestId("setup-tone-warm")).toBeChecked();
      await page.getByTestId("setup-tone-direct").check();
      await expect(page.getByTestId("setup-tone-direct")).toBeChecked();
      await page.getByTestId("setup-done").click();
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByTestId("checkin-card")).toBeVisible();
    } finally {
      await cleanup(email);
    }
  });
});
