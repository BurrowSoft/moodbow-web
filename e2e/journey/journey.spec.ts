import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import conditions from "../../content/conditions.json";
import messages from "../../src/messages/en.json";
import { aiAvailable, cleanup, configured, confirmEmail, confirmLinkHash, createConfirmedUser, exists, newEmail, newPassword, notConfigured, sweep } from "./staging";

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

// Welcome → Consent (AI as asked) → Sign-up, up to its answer.
async function submitSignUp(page: Page, email: string, password: string, { ai }: { ai: boolean }): Promise<void> {
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
}

// Welcome → Consent (AI as asked) → Sign-up → confirmed → Setup.
async function signUp(page: Page, email: string, { ai }: { ai: boolean }): Promise<string> {
  const password = newPassword();
  await submitSignUp(page, email, password, { ai });

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

// Tonight's flows (UX & PM 2026-11-03), so they stay protected after merge.
// Each journey runs once its PR is on master: flip its entry here in the
// same follow-up that lands it (until then it's skipped, not failed).
const LANDED = {
  hiddenDraft: true, // #142: the draft is written when the page is hidden
  signOutChoice: true, // #147: Sign out asks Keep it / Delete it
  deleteAnnounce: true, // #145 + #146: "Entry deleted", focus on the h1
};

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
}

// The draft keys this browser holds (mb:draft-entry:<uid>:…).
const draftKeys = (page: Page) => page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith("mb:draft-entry:")));

// From the editor to Me with unsaved text: the leave dialog, Keep draft.
async function keepDraftAndGoToMe(page: Page): Promise<void> {
  await page.getByTestId("tab-me").click();
  await page.getByTestId("entry-keep-draft").click();
  await expect(page).toHaveURL(/\/app\/me$/);
}

test.describe("tonight's flows", () => {
  test("a phone hiding the tab: the text not yet autosaved survives the tab being closed (#142)", async ({ page, context }) => {
    test.skip(!LANDED.hiddenDraft, "#142 isn't on master yet");
    const email = newEmail();
    try {
      await signUp(page, email, { ai: false });
      await page.getByTestId("setup-done").click();
      await expect(page).toHaveURL(/\/app$/);
      await page.getByTestId("today-write").click();
      await expect(page).toHaveURL(/\/app\/write/);
      await page.getByTestId("entry-text").fill(ENTRY);
      // Hidden at once (well inside the 2 s autosave), the way a phone
      // backgrounds a tab, then closed without beforeunload (Playwright's
      // close doesn't run it), as the system closing it later would.
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.close();
      const again = await context.newPage();
      await again.goto("/app/write");
      await expect(again.getByTestId("entry-text")).toHaveValue(ENTRY);
    } finally {
      await cleanup(email);
    }
  });

  test("sign out with unsaved writing: Keep it brings it back after signing in; Delete it leaves nothing (#147)", async ({ page }) => {
    test.skip(!LANDED.signOutChoice, "#147 isn't on master yet");
    const email = newEmail();
    try {
      const password = await signUp(page, email, { ai: false });
      await page.getByTestId("setup-done").click();
      await expect(page).toHaveURL(/\/app$/);

      // Keep it.
      await page.getByTestId("today-write").click();
      await page.getByTestId("entry-text").fill(ENTRY);
      await keepDraftAndGoToMe(page);
      await page.getByTestId("me-sign-out").click();
      await expect(page.getByTestId("sign-out-dialog")).toBeVisible();
      await expect(page.getByTestId("sign-out-keep")).toBeFocused();
      await page.getByTestId("sign-out-keep").click();
      await expect(page).toHaveURL(/\/sign-in/, { timeout: 20_000 });
      expect(await draftKeys(page)).toHaveLength(1);
      await signIn(page, email, password);
      await page.goto("/app/write");
      await expect(page.getByTestId("entry-text")).toHaveValue(ENTRY);

      // Delete it.
      await page.getByTestId("entry-text").fill("Not for the next person.");
      await keepDraftAndGoToMe(page);
      await page.getByTestId("me-sign-out").click();
      await page.getByTestId("sign-out-delete").click();
      await expect(page).toHaveURL(/\/sign-in/, { timeout: 20_000 });
      expect(await draftKeys(page)).toHaveLength(0);
      await signIn(page, email, password);
      await page.goto("/app/write");
      await expect(page.getByTestId("entry-text")).toHaveValue("");
    } finally {
      await cleanup(email);
    }
  });

  test("delete an entry: 'Entry deleted' is said, and focus is on the destination's title (#145, #146)", async ({ page }) => {
    test.skip(!LANDED.deleteAnnounce, "#145 and #146 aren't on master yet");
    const email = newEmail();
    try {
      await signUp(page, email, { ai: false });
      await page.getByTestId("setup-done").click();
      await expect(page).toHaveURL(/\/app$/);
      await page.getByTestId("today-write").click();
      await page.getByTestId("entry-text").fill(ENTRY);
      await page.getByTestId("entry-save").click();
      await expect(page).toHaveURL(/\/app$/);
      await page.locator('[data-testid^="today-entry-"]').first().click();
      await expect(page).toHaveURL(/\/app\/entries\/[0-9a-f-]{36}$/);
      await page.getByTestId("entry-more").click();
      await page.getByTestId("entry-menu-delete").click();
      await page.getByTestId("entry-delete-confirm").click();
      // Back on Today, where it was opened from (decision 152).
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
      // Said within the region's 5 s, before it clears.
      await expect(page.getByTestId("app-announce")).toHaveText(messages.entry.entryDeletedAnnounce);
      await expect(page.locator("#main h1")).toBeFocused();
      await expect(page.locator('[data-testid^="today-entry-"]')).toHaveCount(0);
    } finally {
      await cleanup(email);
    }
  });
});

// Every way into a first run, on to Today by client navigation alone. The
// journeys above go from Sign-up straight to Setup, so the browser never saw
// /app send a not-yet-onboarded person away; these do. Today's content is the
// assertion: the address and title were already right on the blank page.
test.describe("a first run reaches Today without a reload", () => {
  const finishSetup = async (page: Page) => {
    await page.getByTestId("setup-done").click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tab-today")).toBeVisible();
  };

  // The real email link: it only keeps a web session once the journal is live.
  for (const how of ["countdown", "Continue"] as const) {
    test(`the email link, then ${how}: Setup, then Today`, async ({ page }) => {
      test.skip(!conditions["web-journal-live"].met, "the confirm link keeps a session only with web-journal-live met");
      const email = newEmail();
      const password = newPassword();
      try {
        await submitSignUp(page, email, password, { ai: false });
        await expect(page.getByTestId("check-email")).toBeVisible({ timeout: 20_000 });
        await page.goto(`/auth/confirm?token_hash=${await confirmLinkHash(email, password)}&type=signup`);
        await page.locator("main form button[type=submit]").click();
        await expect(page.getByTestId("email-confirmed-continue")).toBeVisible({ timeout: 20_000 });
        if (how === "Continue") await page.getByTestId("email-confirmed-continue").click();
        await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
        await finishSetup(page);
      } finally {
        await cleanup(email);
      }
    });
  }

  test("signing in before finishing Setup: Setup, then Today; the journal stays closed until then", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await submitSignUp(page, email, password, { ai: false });
      await expect(page.getByTestId("check-email")).toBeVisible({ timeout: 20_000 });
      await confirmEmail(email);
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
      await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
      await finishSetup(page);
    } finally {
      await cleanup(email);
    }
  });

  test("a session gone mid-visit: the next tab goes to sign-in, and signing in reaches Today", async ({ page, context }) => {
    const email = newEmail();
    try {
      const password = await signUp(page, email, { ai: false });
      await finishSetup(page);
      await page.getByTestId("tab-me").click();
      await expect(page).toHaveURL(//app/me$/);
      await context.clearCookies();
      await page.getByTestId("tab-today").click();
      await expect(page).toHaveURL(//sign-in/, { timeout: 20_000 });
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
      await expect(page).toHaveURL(//app$/, { timeout: 20_000 });
      await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    } finally {
      await cleanup(email);
    }
  });

  test("an account with no consents yet: sign-in, Consent, Setup, then Today", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await createConfirmedUser(email, password);
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
      await expect(page).toHaveURL(/\/consent$/, { timeout: 20_000 });
      await page.getByTestId("consent-privacy").check();
      await page.getByTestId("consent-health").check();
      await page.getByTestId("consent-age").check();
      await page.getByTestId("consent-continue").click();
      await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
      await finishSetup(page);
    } finally {
      await cleanup(email);
    }
  });
});
