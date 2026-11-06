import { readFile } from "node:fs/promises";
import { expect, test, type Frame, type Page, type Request } from "@playwright/test";
import conditions from "../../content/conditions.json";
import messages from "../../src/messages/en.json";
import fr from "../../src/messages/fr.json";
import { aiAvailable, cleanup, configured, confirmEmail, createConfirmedUser, exists, newEmail, newPassword, notConfigured, profileLocale, revokeSessions, setProfileLocale, signedUpUnconfirmed, sweep } from "./staging";

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
        await page.goto(`/auth/confirm?token_hash=${await signedUpUnconfirmed(email, password)}&type=signup`);
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

  test("the email link on an account that still owes Consent: Consent, Setup, then Today", async ({ page }) => {
    test.skip(!conditions["web-journal-live"].met, "the confirm link keeps a session only with web-journal-live met");
    const email = newEmail();
    const password = newPassword();
    try {
      await page.goto(`/auth/confirm?token_hash=${await signedUpUnconfirmed(email, password, { consents: false })}&type=signup`);
      await page.locator("main form button[type=submit]").click();
      await expect(page.getByTestId("email-confirmed-continue")).toBeVisible({ timeout: 20_000 });
      await page.getByTestId("email-confirmed-continue").click();
      await expect(page).toHaveURL(/\/consent$/, { timeout: 20_000 });
      await page.getByTestId("consent-privacy").check();
      await page.getByTestId("consent-health").check();
      await page.getByTestId("consent-age").check();
      await page.getByTestId("consent-continue").click();
      await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
      await expect(page.getByTestId("setup-done")).toBeVisible({ timeout: 15_000 });
      await finishSetup(page);
    } finally {
      await cleanup(email);
    }
  });

  test("the journal stays closed until Setup is done", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
      await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
      for (const path of ["/app", "/app/timeline", "/app/me"]) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/setup$/);
        await expect(page.getByTestId("setup-done")).toBeVisible();
      }
    } finally {
      await cleanup(email);
    }
  });

  test("signing in before finishing Setup: Setup, then Today", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password);
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

  test("a session revoked mid-visit: the next tab goes to sign-in, and signing in reaches Today", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
      await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
      await finishSetup(page);
      await page.getByTestId("tab-me").click();
      await expect(page).toHaveURL(/\/app\/me$/);
      await revokeSessions(email, password);
      await page.getByTestId("tab-today").click();
      await expect(page).toHaveURL(/\/sign-in/, { timeout: 20_000 });
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
      await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    } finally {
      await cleanup(email);
    }
  });

  test("no session on the next tab: says so, and signing in reaches Today", async ({ page, context }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
      await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
      await finishSetup(page);
      await page.getByTestId("tab-me").click();
      await expect(page).toHaveURL(/\/app\/me$/);
      await context.clearCookies();
      await page.getByTestId("tab-today").click();
      await expect(page.getByTestId("session-ended")).toContainText(messages.auth.sessionEndedTitle, { timeout: 20_000 });
      await expect(page.getByTestId("journal-unavailable")).toHaveCount(0);
      await page.getByTestId("session-ended-sign-in").click();
      await expect(page).toHaveURL(/\/sign-in/, { timeout: 20_000 });
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
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

// Stopped partway, the screen says to import the same file again. A browser
// fires no change for the file an input already holds, so the input has to let
// go of it, or nothing happens (Web Tester, #178).
test.describe("importing the same file again", () => {
  const signedIn = async (page: Page, email: string, password: string) => {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
    await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
    await page.getByTestId("setup-done").click();
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("tab-me").click();
    await expect(page).toHaveURL(/\/app\/me$/);
  };
  // 150 days: two batches of check-ins.
  const days = Array.from({ length: 150 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));
  const file = { name: "export.csv", mimeType: "text/csv", buffer: Buffer.from(`date,mood\n${days.map((d) => `${d},4`).join("\n")}\n`) };
  const held = (page: Page) => page.getByTestId("import-file").evaluate((el) => (el as HTMLInputElement).files?.length ?? -1);

  test("stopped partway: the same file can be chosen again, without a reload, and finishes", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await signedIn(page, email, password);
      // The counts and the first batch go through; the second doesn't.
      let posts = 0;
      await page.route("**/app/me", async (route) => {
        if (route.request().method() === "POST" && ++posts > 2) await route.abort();
        else await route.continue();
      });
      await page.getByTestId("import-file").setInputFiles(file);
      await page.getByTestId("import-confirm").click();
      await expect(page.getByTestId("import-failed")).toContainText(messages.me.importStopped, { timeout: 60_000 });
      await page.unroute("**/app/me");

      // What makes a browser fire for the same file again.
      expect(await held(page)).toBe(0);
      await page.getByTestId("import-file").setInputFiles(file);
      await page.getByTestId("import-confirm").click();
      await expect(page.getByTestId("import-done")).toBeVisible({ timeout: 90_000 });
      expect(await held(page)).toBe(0);
    } finally {
      await cleanup(email);
    }
  });

  test("a file it couldn't read, and Cancel: the same file can be chosen again", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await signedIn(page, email, password);
      await page.getByTestId("import-file").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("not,a,journal\n") });
      await expect(page.getByTestId("import-error")).toBeVisible();
      expect(await held(page)).toBe(0);
      await page.getByTestId("import-file").setInputFiles(file);
      await expect(page.getByTestId("import-confirm")).toBeVisible();
      await page.getByTestId("import-cancel").click();
      expect(await held(page)).toBe(0);
    } finally {
      await cleanup(email);
    }
  });
});

// Inside the journal the saved language wins, if it's offered (row RT4). Each
// one asserts Today's content and that the page has stopped moving: an address
// alone was right on the blank page (#173).
test.describe("the saved language in the journal", () => {
  test.skip(!conditions["fr-offered-live"].met, "needs French offered");

  // Vitor's French sign-up on www (2026-11-06): the mail was French, the pages
  // after it English. The first page has no session, so only the link's own
  // language can set it; from the next page on, the saved language does.
  for (const [how, route] of [["a link with its language", "/fr"], ["a link without one, already sent", ""]]) {
    test(`French sign-up from ${how}: French through to Today`, async ({ page }) => {
      const email = newEmail();
      const password = newPassword();
      const french = () => expect(page.locator("html")).toHaveAttribute("lang", "fr");
      try {
        await page.goto(`${route}/auth/confirm?token_hash=${await signedUpUnconfirmed(email, password, { locale: "fr" })}&type=signup`);
        if (route) {
          await french();
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(fr.confirmLink.signupTitle);
        }
        await page.locator("main form button[type=submit]").click();
        await expect(page).toHaveURL(/\/fr\/email-confirmed/, { timeout: 20_000 });
        await french();
        await expect(page.getByTestId("email-confirmed-continue")).toHaveText(fr.emailConfirmed.emailConfirmedContinue, { timeout: 20_000 });
        await page.getByTestId("email-confirmed-continue").click();
        await expect(page).toHaveURL(/\/fr\/setup$/, { timeout: 20_000 });
        await french();
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(fr.onboarding.setupTitle);
        await page.getByTestId("setup-done").click();
        await expect(page).toHaveURL(/\/fr\/app$/, { timeout: 20_000 });
        await french();
        await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
      } finally {
        await cleanup(email);
      }
    });
  }

  test("signed out, the language switcher is still there on the way in", async ({ page }) => {
    await page.goto("/fr/consent");
    await expect(page.locator("[data-language-switcher]")).toBeVisible();
    await page.goto("/fr/sign-in");
    await expect(page.locator("[data-language-switcher]")).toBeVisible();
  });

  test("signed in on /setup in another language: their saved one", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password, { locale: "fr" });
      await confirmEmail(email);
      await page.goto("/fr/sign-in");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.locator("main form button[type=submit]").first().click();
      await expect(page).toHaveURL(/\/fr\/setup$/, { timeout: 20_000 });
      // Signed in, Me → Language is the one control: no switcher to bounce off.
      await expect(page.locator("[data-language-switcher]")).toBeHidden();
      // The English route for real: the proxy would answer the French cookie itself.
      await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", url: page.url() }]);
      await page.goto("/setup");
      await expect(page).toHaveURL(/\/fr\/setup$/, { timeout: 20_000 });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(fr.onboarding.setupTitle);
    } finally {
      await cleanup(email);
    }
  });

  // The labels are in the page's language, so by field, not by name.
  const signInForm = async (page: Page, email: string, password: string) => {
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
  };
  // Settled here: the address holds for two seconds, with no page load in that time.
  const settled = async (page: Page, path: string, lang: string | RegExp) => {
    // The whole path: "/app/me" must not match /pt-br/app/me, still on its way.
    const url = new RegExp(`^https?://[^/]+${path}$`);
    await expect(page).toHaveURL(url, { timeout: 20_000 });
    // A move: a new page load, or any other address (a soft bounce). The
    // router's own history update on this address isn't one.
    const moves: string[] = [];
    const load = (request: Request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) moves.push(request.url());
    };
    const elsewhere = (frame: Frame) => {
      if (frame === page.mainFrame() && !url.test(frame.url())) moves.push(frame.url());
    };
    page.on("request", load);
    page.on("framenavigated", elsewhere);
    await page.waitForTimeout(2_000);
    page.off("request", load);
    page.off("framenavigated", elsewhere);
    expect(moves, "the page kept moving").toEqual([]);
    await expect(page).toHaveURL(url);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
  };
  const today = (page: Page) => expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });

  test("English saved, a French browser: Today in English, and it stays there", async ({ browser }) => {
    const context = await browser.newContext({ locale: "fr-FR" });
    const page = await context.newPage();
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
      await page.goto("/sign-in");
      await expect(page).toHaveURL(/\/fr\/sign-in/);
      await signInForm(page, email, password);
      await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
      await page.getByTestId("setup-done").click();
      await today(page);
      await settled(page, "/app", "en");
      await today(page);
      await page.reload();
      await settled(page, "/app", "en");
      await today(page);
    } finally {
      await cleanup(email);
      await context.close();
    }
  });

  test("French saved, an English browser: Today in French; a tab keeps it", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password, { locale: "fr" });
      await confirmEmail(email);
      await page.goto("/sign-in");
      await signInForm(page, email, password);
      await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
      await page.getByTestId("setup-done").click();
      await today(page);
      await settled(page, "/fr/app", "fr");
      await page.getByTestId("tab-me").click();
      await settled(page, "/fr/app/me", "fr");
      await page.getByTestId("tab-today").click();
      await settled(page, "/fr/app", "fr");
      await today(page);
    } finally {
      await cleanup(email);
    }
  });

  test("the language cookie can't be written: it stops with a link, and doesn't reload forever", async ({ browser }) => {
    const context = await browser.newContext({ locale: "fr-FR" });
    const page = await context.newPage();
    // As a privacy extension does: this one cookie never sticks.
    await page.addInitScript(() => {
      const cookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;
      Object.defineProperty(document, "cookie", {
        get: () => cookie.get!.call(document),
        set: (value: string) => {
          if (!value.startsWith("NEXT_LOCALE=")) cookie.set!.call(document, value);
        },
      });
    });
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
      await page.goto("/sign-in");
      await signInForm(page, email, password);
      // Setup follows the saved language too, so that's where it stops now.
      await expect(page.getByTestId("saved-language-link")).toBeVisible({ timeout: 20_000 });
      await settled(page, "/fr/setup", "fr");
      // Held back for 2 s on the way; here it must really show, reduced motion or not.
      await expect(page.getByTestId("saved-language-link")).toHaveCSS("opacity", "1");
      // The link gets them there: the server sets the cookie on that load.
      await page.getByTestId("saved-language-link").click();
      await settled(page, "/setup", "en");
      await page.getByTestId("setup-done").click();
      await settled(page, "/app", "en");
      await today(page);
    } finally {
      await cleanup(email);
      await context.close();
    }
  });

  test("a saved language that isn't offered keeps the route", async ({ page }) => {
    test.skip(conditions["de-offered-live"].met, "needs German not offered");
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password, { locale: "de" });
      await confirmEmail(email);
      await page.goto("/sign-in");
      await signInForm(page, email, password);
      await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
      await page.getByTestId("setup-done").click();
      await today(page);
      await settled(page, "/app", "en");
    } finally {
      await cleanup(email);
    }
  });

  test("Me → Language, there and back: content each time, no bounce; the switcher only outside the journal", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
      await page.goto("/sign-in");
      await signInForm(page, email, password);
      await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
      await page.getByTestId("setup-done").click();
      await today(page);
      await expect(page.locator("footer nav [lang]")).toHaveCount(0);
      await page.getByTestId("tab-me").click();
      await expect(page).toHaveURL(/\/app\/me$/);

      await page.getByTestId("me-language").selectOption("fr");
      await settled(page, "/fr/app/me", "fr");
      await expect(page.getByTestId("me-language")).toHaveValue("fr");
      expect(await profileLocale(email)).toBe("fr");
      await page.getByTestId("tab-today").click();
      await settled(page, "/fr/app", "fr");
      await today(page);

      await page.getByTestId("tab-me").click();
      await expect(page).toHaveURL(/\/fr\/app\/me$/);
      await page.getByTestId("me-language").selectOption("pt-br");
      await settled(page, "/pt-br/app/me", /^pt/i);
      await expect(page.getByTestId("me-language")).toHaveValue("pt-br");
      expect(await profileLocale(email)).toBe("pt");

      await page.getByTestId("me-language").selectOption("en");
      await settled(page, "/app/me", "en");
      await expect(page.getByTestId("me-language")).toHaveValue("en");
      expect(await profileLocale(email)).toBe("en");
      await page.reload();
      await settled(page, "/app/me", "en");
      await page.getByTestId("tab-today").click();
      await settled(page, "/app", "en");
      await today(page);

      await page.goto("/help");
      await expect(page.locator("footer nav [lang]").first()).toBeVisible();
    } finally {
      await cleanup(email);
    }
  });

  test("a first sign-up on /pt-br: saved as pt, Today in Portuguese, no bounce", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await page.goto("/pt-br/welcome?slide=3");
      await page.getByTestId("welcome-start").click();
      await expect(page).toHaveURL(/\/pt-br\/consent$/);
      await page.getByTestId("consent-privacy").check();
      await page.getByTestId("consent-health").check();
      await page.getByTestId("consent-continue").click();
      await expect(page).toHaveURL(/\/pt-br\/sign-up$/);
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByTestId("signup-age").check();
      await page.getByTestId("signup-submit").click();
      await expect(page.getByTestId("check-email")).toBeVisible({ timeout: 20_000 });
      await confirmEmail(email);
      await page.getByTestId("check-email-confirmed").click();
      await expect(page).toHaveURL(/\/pt-br\/setup$/, { timeout: 20_000 });
      expect(await profileLocale(email)).toBe("pt");
      await page.getByTestId("setup-done").click();
      await today(page);
      await settled(page, "/pt-br/app", /^pt/i);
      await page.reload();
      await settled(page, "/pt-br/app", /^pt/i);
      await today(page);
    } finally {
      await cleanup(email);
    }
  });
});

// The longest words we have, at the narrowest phones: whole words in the tab
// bar, in every language, with nothing scrolling sideways (Web Tester, #178).
test.describe("the tab bar in every language", () => {
  for (const width of [320, 390]) {
    test(`${width} px: no label breaks inside a word`, async ({ page }) => {
      const email = newEmail();
      const password = newPassword();
      try {
        await signedUpUnconfirmed(email, password);
        await confirmEmail(email);
        await page.goto("/sign-in");
        await page.getByLabel("Email").fill(email);
        await page.getByLabel("Password").fill(password);
        await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
        await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
        await page.getByTestId("setup-done").click();
        await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
        await page.setViewportSize({ width, height: 800 });
        for (const [route, saved] of [["", "en"], ["/th", "th"], ["/fr", "fr"], ["/es", "es"], ["/pt-br", "pt"], ["/de", "de"], ["/it", "it"]]) {
          await setProfileLocale(email, password, saved);
          await page.goto(`${route}/app`);
          await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
          // A label's lines: one per word at most; a broken word adds one.
          const labels = await page.locator('a[data-testid^="tab-"] > span:last-child').evaluateAll((spans) =>
            spans.filter((span) => getComputedStyle(span).display !== "none").map((span) => {
              const range = document.createRange();
              range.selectNodeContents(span);
              const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
              return { text: span.textContent ?? "", lines: tops.size };
            }),
          );
          expect(labels, route).toHaveLength(4);
          for (const { text, lines } of labels) expect(lines, `${route || "/en"}: ${text}`).toBeLessThanOrEqual(text.trim().split(/\s+/).length);
          expect(await page.evaluate(() => document.documentElement.scrollWidth), route).toBeLessThanOrEqual(width);
          // Text at its normal size keeps its words: icons only is for large text.
          await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
          await expect(page.locator("ul[data-tab-icons]"), `${route || "/en"} at 100%`).toHaveCount(0);
          // Browser text at 200% and 300%: one line each, scaled to share the row
          // and never under 11 px; or icons only, each tab still named.
          for (const percent of [200, 300]) {
            await page.addStyleTag({ content: `html { font-size: ${percent}% }` });
            await expect
              .poll(
                () =>
                  page.locator('a[data-testid^="tab-"]').evaluateAll((links) =>
                    links.flatMap((link) => {
                      const label = link.querySelector("[data-tab-label]");
                      if (!label || !label.textContent?.trim()) return ["a tab with no name"];
                      const style = getComputedStyle(label);
                      if (style.position === "absolute") return [];
                      const range = document.createRange();
                      range.selectNodeContents(label);
                      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
                      const size = parseFloat(style.fontSize);
                      return lines === 1 && size >= 11 && link.scrollWidth <= link.clientWidth ? [] : [`${label.textContent}: ${lines} lines, ${size} px, ${link.scrollWidth} in ${link.clientWidth}`];
                    }),
                  ),
                { message: `${route || "/en"} at ${percent}%` },
              )
              .toEqual([]);
          }
        }
      } finally {
        await cleanup(email);
      }
    });
  }

  // The browser's real text setting: rem-based breakpoints move with it, which an
  // injected style doesn't do, and that hid both of these (Web Tester, #193).
  test("large text, set in the browser: tabs keep their words on a wider phone; nothing scrolls sideways", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Page.setFontSizes is Chromium's");
    test.setTimeout(180_000);
    const email = newEmail();
    const password = newPassword();
    const cdp = await page.context().newCDPSession(page);
    const textAt = (percent: number) => cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
    try {
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
      await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
      await page.getByTestId("setup-done").click();
      await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });

      const labelSize = async () => {
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        return page.evaluate(() => (document.querySelector("ul[data-tab-icons]") ? "icons" : parseFloat(getComputedStyle(document.querySelector("[data-tab-label]")!).fontSize)));
      };
      await textAt(200);
      for (const [route, saved] of [["", "en"], ["/th", "th"], ["/fr", "fr"], ["/es", "es"], ["/pt-br", "pt"], ["/de", "de"], ["/it", "it"]]) {
        await setProfileLocale(email, password, saved);
        await page.setViewportSize({ width: 320, height: 800 });
        await page.goto(`${route}/app`);
        await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), route || "/en").toBe("32px");
        await expect.poll(labelSize, { message: `${route || "/en"} at 320` }).toBeGreaterThanOrEqual(11);
        const narrow = (await labelSize()) as number;
        await page.setViewportSize({ width: 390, height: 800 });
        await expect.poll(labelSize, { message: `${route || "/en"} at 390` }).toBeGreaterThanOrEqual(narrow);
      }

      await setProfileLocale(email, password, "en");
      await page.setViewportSize({ width: 320, height: 800 });

      // The safety card at the largest text: Close is a button to tap, not a
      // column of letters, and it closes.
      await textAt(300);
      for (const [route, saved] of [["", "en"], ["/fr", "fr"], ["/es", "es"], ["/pt-br", "pt"]]) {
        await setProfileLocale(email, password, saved);
        await page.goto(`${route}/app/me`);
        await page.getByTestId("me-get-help").click();
        const close = page.getByTestId("safety-close");
        await expect(close, route || "/en").toBeInViewport();
        const lines = await close.evaluate((button) => {
          const range = document.createRange();
          range.selectNodeContents(button);
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        });
        expect(lines, `Close's lines, ${route || "/en"}`).toBe(1);
        await close.click();
        await expect(page.getByTestId("safety-card"), route || "/en").toHaveCount(0);
      }
      await setProfileLocale(email, password, "en");

      // Today's check-in once a mood is picked, where its details open.
      await textAt(200);
      await page.goto("/app");
      await page.getByTestId("checkin-mood-3").click();
      await expect(page.getByTestId("checkin-sleep-quality-good")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "Today's details at 200%").toBeLessThanOrEqual(0);

      for (const percent of [200, 300]) {
        await textAt(percent);
        for (const path of ["/app", "/app/timeline", "/app/insights", "/app/me", "/app/write"]) {
          await page.goto(path);
          // The page itself, not its loading state, which is narrow and would pass.
          await page.waitForLoadState("networkidle");
          await expect(page.getByTestId("app-loading")).toHaveCount(0);
          await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
          // The setting really is on, or all of this would pass at the normal size.
          expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), `${path} at ${percent}%`).toBe(`${(16 * percent) / 100}px`);
          // What sticks out, named, so a failure says where to look.
          const sticksOut = await page.evaluate(() => {
            const inScroller = (e: Element) => {
              for (let p = e.parentElement; p; p = p.parentElement) if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX) || getComputedStyle(p).position === "fixed") return true;
              return false;
            };
            return [...document.querySelectorAll("body *")]
              .filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5 && getComputedStyle(e).position !== "fixed" && e.getBoundingClientRect().width > 1 && !inScroller(e))
              .slice(0, 6)
              .map((e) => `${e.tagName.toLowerCase()}${e.getAttribute("data-testid") ? `[${e.getAttribute("data-testid")}]` : ""} ${Math.round(e.getBoundingClientRect().right)}`);
          });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          // Soft: one run lists every page that needs a look.
          expect.soft({ path, percent, overflow, sticksOut }).toEqual({ path, percent, overflow: 0, sticksOut: [] });
        }
      }
    } finally {
      await cleanup(email);
    }
  });
});
