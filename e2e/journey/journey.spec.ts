import { readFile } from "node:fs/promises";
import { expect, test, type Frame, type Page, type Request } from "@playwright/test";
import conditions from "../../content/conditions.json";
import countries from "../../content/contracts/countries.json";
import messages from "../../src/messages/en.json";
import fr from "../../src/messages/fr.json";
import { monthsBefore } from "../../src/lib/journal/onThisDay";
import { axeAtWidths } from "../axe";
import { aiConsentGranted, journalToday, aiAvailable, cleanup, configured, confirmEmail, createConfirmedUser, exists, lastWeekMonday, seedCheckIns, newEmail, newPassword, notConfigured, profileLocale, profileSaver, revokeSessions, setProfileLocale, signedUpUnconfirmed, sweep, grantPlusTrial, plusOnStaging } from "./staging";

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

// Home's Start → Create account, with its consent boxes (AI as asked) → confirmed → Today (1.3 §6).
// The real form sends a real email, and staging limits those: heavy days failed CI on "Please wait a
// minute". So the journeys that test the form are tagged @real-email and run on PRs that touch
// sign-up, and in the daily run of everything on master (ci.yml); the rest start from accountAtSetup, which sends none.
async function signUp(page: Page, email: string, { ai }: { ai: boolean }): Promise<string> {
  const password = newPassword();
  await page.goto("/");
  await page.getByTestId("home-start").click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByTestId("signup-summary")).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  // Separate, unticked boxes; Create account waits for all three.
  for (const id of ["consent-privacy", "consent-health", "consent-age"]) await expect(page.getByTestId(id)).not.toBeChecked();
  await expect(page.getByTestId("signup-submit")).toBeDisabled();
  await page.getByTestId("consent-privacy").check();
  await page.getByTestId("consent-health").check();
  await expect(page.getByTestId("signup-submit")).toBeDisabled();
  await page.getByTestId("consent-age").check();
  if (ai) await page.getByTestId("consent-ai").check();
  else if (await page.getByTestId("consent-ai").count()) await expect(page.getByTestId("consent-ai")).not.toBeChecked();
  await page.getByTestId("signup-submit").click();

  // Staging asks for confirmation: confirm through the admin API, then the
  // "I've confirmed" button signs in. (Without confirmation it goes straight on.)
  const checkEmail = page.getByTestId("check-email");
  await expect(checkEmail.or(page.getByTestId("checkin-card"))).toBeVisible({ timeout: 20_000 });
  if (await checkEmail.isVisible()) {
    await confirmEmail(email);
    await page.getByTestId("check-email-confirmed").click();
  }
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  return password;
}

test.describe("launch journeys", () => {
  test("AI off: sign-up to delete account, through every tab and the export", { tag: "@real-email" }, async ({ page }) => {
    const email = newEmail();
    try {
      await signUp(page, email, { ai: false });

      // Setup after first use (1.3 §6): the journal opened at once; Setup is still there to open.
      await page.goto("/setup");
      // No AI, so no focus or tone; just the reminder.
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
      await accountAtSetup(page, email);
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

  test("AI on: consent → setup's focus and tone → Today", { tag: "@real-email" }, async ({ page }) => {
    const email = newEmail();
    try {
      const password = await signUp(page, email, { ai: true });
      // What the form's box is for, whether or not staging's AI switch is on.
      expect(await aiConsentGranted(email, password)).toBe(true);

      // Focus and tone also need staging's global AI switch, which is off
      // outside AI windows (decision 123): read it as the app does, and skip
      // rather than fail while it's off.
      test.skip(!(await aiAvailable(email, password)), "staging's AI switch is off (get_me().ai_available false): AI-on journey skipped");
      await page.goto("/setup");
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

// An account at Setup, without the form's email: confirmed, signed in through the page.
// The card's first link, whole on its first screen, above the fade, at 320x640 at 300 %. The cases that
// don't fit, one by one (UX, #255), as the most px each may run under the fade. Colombia has no helpline,
// so its first link is the emergency number, and the sentence above it already says to call one.
const FIRST_LINK_OVER: Record<string, number> = { "CO /pt-br": 1 };
const firstLinkOnScreen = (card: Element) => {
  const fade = card.querySelector("[data-testid=dialog-more]");
  const shown = Math.min(innerHeight, (fade ?? card).getBoundingClientRect()[fade ? "top" : "bottom"]);
  const link = card.querySelector("a")!;
  const top = link.getClientRects()[0];
  return { over: Math.round(link.getBoundingClientRect().bottom - shown), tappable: top.top < shown && link.contains(document.elementFromPoint(top.left + 4, top.top + top.height / 2)) };
};

async function accountAtSetup(page: Page, email: string): Promise<string> {
  const password = newPassword();
  await signedUpUnconfirmed(email, password);
  await confirmEmail(email);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  return password;
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
      await accountAtSetup(page, email);
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
      const password = await accountAtSetup(page, email);
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
      await accountAtSetup(page, email);
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
        await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
        await finishSetup(page);
      } finally {
        await cleanup(email);
      }
    });
  }

  test("the email link on an account that still owes Consent: Consent, then Today", async ({ page }) => {
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
      await finishSetup(page);
    } finally {
      await cleanup(email);
    }
  });

  test("Setup after first use: the journal opens at once, the reminder off until chosen, Setup offered after a check-in", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
      for (const path of ["/app/timeline", "/app/me"]) {
        await page.goto(path);
        await expect(page).toHaveURL(RegExp(`${path}$`));
      }
      // The protective default: the reminder is off until they choose one.
      await expect(page.getByTestId("me-reminder-on")).toHaveAttribute("aria-checked", "false");
      // Today offers Setup once there's a check-in.
      await page.goto("/app");
      await expect(page.getByTestId("today-setup-later")).toHaveCount(0);
      await page.getByTestId("checkin-mood-4").click();
      await page.getByTestId("checkin-save").click();
      await expect(page.getByTestId("checkin-summary")).toBeVisible({ timeout: 15_000 });
      await page.reload();
      await expect(page.getByTestId("today-setup-later")).toBeVisible();
      await page.getByTestId("today-setup-later-open").click();
      await expect(page).toHaveURL(/\/setup$/);
      await expect(page.getByTestId("setup-done")).toBeVisible();
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
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
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
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
      await finishSetup(page);
      await page.getByTestId("tab-me").click();
      await expect(page).toHaveURL(/\/app\/me$/);
      await revokeSessions(email, password);
      await page.getByTestId("tab-today").click();
      // Two safe ends, whichever check sees the revoke first (#299's trace, UX 14 Nov): sign-in, or
      // the journal page's own "Your session has ended" (SessionEnded) with its Sign in. 5 of 7
      // runs went to sign-in; one showed the screen at /app. Either way, nothing of the journal.
      const ended = page.getByTestId("session-ended");
      await expect(page.getByLabel("Email").or(ended)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("checkin-card")).toHaveCount(0);
      await expect(page.getByTestId("today-greeting")).toHaveCount(0);
      await expect(page.locator('[data-testid^="today-entry-"]')).toHaveCount(0);
      if (await ended.isVisible()) {
        await expect(ended).toContainText(messages.auth.sessionEndedTitle);
        await page.getByTestId("session-ended-sign-in").click();
      }
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
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
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
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
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
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
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

test.describe("Your week on Insights", () => {
  test("under 4 check-ins no card; a pattern and how it looked; a hard week, only that and the way to help", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
      await page.goto("/sign-in");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.locator("main form button[type=submit]").first().click();
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
      await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
      const monday = await lastWeekMonday(email);

      // Three check-ins: nothing, not even a message about too few days.
      await seedCheckIns(email, password, monday, [0, 1, 2].map((offset) => ({ offset, mood: 5 })));
      await page.goto("/app/insights");
      await expect(page.getByTestId("insights-range-week")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("your-week")).toHaveCount(0);

      // A pattern (sleep), then how it looked, with the quiet line.
      await seedCheckIns(email, password, monday, [
        { offset: 0, mood: 5, sleep_hours: 8 },
        { offset: 1, mood: 5, sleep_hours: 8 },
        { offset: 2, mood: 4, sleep_hours: 7 },
        { offset: 3, mood: 2, sleep_hours: 5 },
        { offset: 4, mood: 3, sleep_hours: 6 },
      ]);
      await page.reload();
      const card = page.getByTestId("your-week");
      await expect(card.getByTestId("your-week-patternSleep")).toHaveText(messages.insights.yourWeekPatternSleep);
      await expect(card.getByTestId("your-week-lookMoreGood")).toHaveText(messages.insights.yourWeekLookMoreGood);
      await expect(card.getByTestId("your-week-caption")).toHaveText(messages.insights.yourWeekCaption);

      // A hard week: only that, and the help opens the card.
      await seedCheckIns(email, password, monday, [
        { offset: 0, mood: 1, sleep_hours: 8 },
        { offset: 1, mood: 2, sleep_hours: 8 },
        { offset: 2, mood: 1, sleep_hours: 5 },
        { offset: 3, mood: 2, sleep_hours: 5 },
        { offset: 4, mood: 4, sleep_hours: 6 },
      ]);
      await page.reload();
      await expect(card.getByTestId("your-week-hard")).toHaveText(messages.insights.yourWeekHard);
      await expect(card.locator('[data-testid^="your-week-pattern"], [data-testid^="your-week-look"], [data-testid="your-week-caption"], [data-testid="your-week-moment"]')).toHaveCount(0);
      await card.getByTestId("your-week-help").click();
      await expect(page.getByTestId("safety-card")).toBeVisible();
    } finally {
      await cleanup(email);
    }
  });
});

test("the Consumer Health Data link is in the footer inside the journal too", async ({ page }) => {
  const email = newEmail();
  const password = newPassword();
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await page.goto("/setup");
    const link = page.getByRole("contentinfo").locator('a[href$="/consumer-health-data"]');
    await expect(link, "Setup").toBeVisible();
    await page.getByTestId("setup-done").click();
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    await expect(link, "Today").toBeVisible();
    await page.goto("/app/write");
    await expect(link, "writing").toBeVisible();
    await page.goto("/app/me");
    await expect(link, "Me").toBeVisible();
  } finally {
    await cleanup(email);
  }
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
      await expect(page).toHaveURL(/\/fr\/app$/, { timeout: 20_000 });
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
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
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
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
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
      // Today follows the saved language too, so that's where it stops now (Setup comes after first use).
      await expect(page.getByTestId("saved-language-link")).toBeVisible({ timeout: 20_000 });
      await settled(page, "/fr/app", "fr");
      // Held back for 2 s on the way; here it must really show, reduced motion or not.
      await expect(page.getByTestId("saved-language-link")).toHaveCSS("opacity", "1");
      // The link gets them there: the server sets the cookie on that load.
      await page.getByTestId("saved-language-link").click();
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
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
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
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
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

  test("a first sign-up on /pt-br: saved as pt, Today in Portuguese, no bounce", { tag: "@real-email" }, async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await page.goto("/pt-br");
      await page.getByTestId("home-start").click();
      await expect(page).toHaveURL(/\/pt-br\/sign-up$/);
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByTestId("consent-privacy").check();
      await page.getByTestId("consent-health").check();
      await page.getByTestId("consent-age").check();
      await page.getByTestId("signup-submit").click();
      await expect(page.getByTestId("check-email")).toBeVisible({ timeout: 20_000 });
      await confirmEmail(email);
      await page.getByTestId("check-email-confirmed").click();
      await expect(page).toHaveURL(/\/pt-br\/app$/, { timeout: 20_000 });
      expect(await profileLocale(email)).toBe("pt");
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
        await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
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
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
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
      await page.setViewportSize({ width: 320, height: 640 });
      for (const [route, saved] of [["", "en"], ["/fr", "fr"], ["/es", "es"], ["/pt-br", "pt"]]) {
        await setProfileLocale(email, password, saved);
        await page.goto(`${route}/app/me`);
        await page.getByTestId("me-get-help").click();
        // Taller than the window: it opens at its top, with a fade showing there's
        // more, and the first help line is on the first screen (firstLinkOnScreen has the known limit).
        const card = page.getByTestId("safety-card");
        await expect(card.getByRole("heading", { level: 2 })).toBeInViewport();
        await expect(card.getByTestId("dialog-more")).toBeVisible();
        expect(await card.evaluate((el) => el.scrollTop), "opens at its top").toBe(0);
        const first = await card.evaluate(firstLinkOnScreen);
        expect.soft(first.tappable, `the first help line can be tapped on the first screen, ${route || "/en"}`).toBe(true);
        expect.soft(first.over, `px of the first help line past the first screen, ${route || "/en"}`).toBeLessThanOrEqual(0);
        // "Find a helpline" stays under the help's cap, not three times its size.
        const size = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
        expect(await card.getByTestId("safety-find-helpline").evaluate(size), `the helpline link's size, ${route || "/en"}`).toBeLessThan(await page.getByTestId("safety-close").evaluate(size));
        const close = page.getByTestId("safety-close");
        await close.scrollIntoViewIfNeeded();
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
      await page.setViewportSize({ width: 320, height: 800 });

      // The delete dialog: its title and warning first, not scrolled down to a button.
      await page.goto("/app/me");
      await page.getByTestId("me-delete").click();
      const deleting = page.getByTestId("delete-dialog");
      await expect(deleting.getByRole("heading", { level: 2 })).toBeInViewport();
      expect(await deleting.evaluate((el) => el.scrollTop), "the delete dialog opens at its top").toBe(0);
      await page.keyboard.press("Escape");
      await expect(deleting).toHaveCount(0);

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
          // Gutters and card padding stay what they are at the normal size: rem would triple
          // at 300 %, leaving 176 px of a 320 px phone for 48 px text (Web Tester, #201).
          const tripled = await page.evaluate(() => {
            const left = (e: Element) => parseFloat(getComputedStyle(e).paddingLeft);
            const cards = [...document.querySelectorAll('#main, #main [class*="rounded-3xl"], #main [class*="rounded-2xl"][class*="border"]')];
            return cards.filter((e) => left(e) > 24).slice(0, 6).map((e) => `${e.tagName.toLowerCase()} ${left(e)}`);
          });
          expect.soft({ path, percent, tripled }).toEqual({ path, percent, tripled: [] });
          // A negative margin must match the px padding it pairs with.
          const pulledOut = await page.evaluate(() => [...document.querySelectorAll("#main *")].filter((e) => Math.abs(parseFloat(getComputedStyle(e).marginLeft)) > 24 && parseFloat(getComputedStyle(e).marginLeft) < 0).slice(0, 6).map((e) => e.tagName.toLowerCase()));
          expect.soft({ path, percent, pulledOut }).toEqual({ path, percent, pulledOut: [] });
        }
      }
    } finally {
      await cleanup(email);
    }
  });
});

// The journal's other screens on a 320 px phone at the browser's own large text, in
// English and the longest two languages. Soft: one run lists everything that needs a
// look, named.
test("large text, set in the browser: Today after a mood, calendar, day, entry and writing stay inside a 320 px phone", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Page.setFontSizes is Chromium's");
  test.setTimeout(300_000);
  const email = newEmail();
  const password = newPassword();
  const cdp = await page.context().newCDPSession(page);
  const textAt = (percent: number) => cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });

    // A past day with a check-in, and an entry, at the normal size.
    const day = await lastWeekMonday(email);
    await seedCheckIns(email, password, day, [{ offset: 0, mood: 3, sleep_hours: 7 }]);
    await page.goto("/app/write");
    await page.getByTestId("entry-text").fill("A few ordinary words about the day, to fill a line or two.");
    await page.getByTestId("entry-save").click();
    await expect(page).toHaveURL(/\/app$/);
    await page.locator('[data-testid^="today-entry-"]').first().click();
    await expect(page).toHaveURL(/\/app\/entries\/[0-9a-f-]{36}$/);
    const entry = new URL(page.url()).pathname;

    // A moment a month ago, with a check-in, so On this day shows with its mood in words.
    // Not every day has one (the 31st, in a shorter month): then this part says so.
    const aMonthAgo = monthsBefore(await journalToday(email, password), 1);
    if (aMonthAgo) {
      await seedCheckIns(email, password, aMonthAgo, [{ offset: 0, mood: 3, sleep_hours: 7 }]);
      await page.goto(`/app/write?date=${aMonthAgo}`);
      await page.getByTestId("entry-text").fill("A moment worth seeing again, in a few ordinary words.");
      await page.getByTestId("entry-moment").click();
      await page.getByTestId("entry-save").click();
      await expect(page).not.toHaveURL(/\/app\/write/, { timeout: 15_000 });
    } else console.log("No day a month ago today: On this day isn't measured in this run.");

    await page.setViewportSize({ width: 320, height: 800 });
    const measure = async (screen: string, percent: number) => {
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("app-loading")).toHaveCount(0);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      // The setting really is on, or all of this would pass at the normal size.
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), screen).toBe(`${(16 * percent) / 100}px`);
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
      expect.soft({ screen, percent, overflow, sticksOut }).toEqual({ screen, percent, overflow: 0, sticksOut: [] });
    };

    for (const [route, saved] of [["", "en"], ["/fr", "fr"], ["/de", "de"]]) {
      await setProfileLocale(email, password, saved);
      for (const percent of [200, 300]) {
        await textAt(percent);
        await page.goto(`${route}/app`);
        await page.getByTestId("checkin-mood-3").click();
        await expect(page.getByTestId("checkin-sleep-quality-good")).toBeVisible();
        await measure(`${saved} Today after a mood`, percent);
        await page.goto(`${route}/app/timeline`);
        await page.getByTestId("timeline-view-calendar").click();
        await expect(page.getByTestId("month-calendar")).toBeVisible();
        // On this day sits above the calendar, so this measures it too.
        if (aMonthAgo) await expect(page.getByTestId("on-this-day-mood")).toBeVisible();
        await measure(`${saved} calendar`, percent);
        await page.goto(`${route}/app/timeline/${day}`);
        await measure(`${saved} day page`, percent);
        await page.goto(`${route}${entry}`);
        await expect(page.getByTestId("entry-body")).toBeVisible();
        await measure(`${saved} entry`, percent);
        await page.goto(`${route}/app/write`);
        await expect(page.getByTestId("entry-text")).toBeVisible();
        await measure(`${saved} writing`, percent);
        // A page's heading keeps its words whole at 200 %, and isn't smaller than the body.
        for (const path of ["/app/timeline", "/app/insights", "/app/me"]) {
          await page.goto(`${route}${path}`);
          const heading = page.getByRole("heading", { level: 1 });
          await expect(heading).toBeVisible();
          const size = await heading.evaluate((h) => {
            const style = getComputedStyle(h);
            const ruler = document.createElement("canvas").getContext("2d")!;
            ruler.font = style.font;
            // The heading's own tracking, and the room it has: Insights' sizes to its text.
            ruler.letterSpacing = style.letterSpacing;
            return { widest: Math.max(...(h.textContent ?? "").split(" ").map((w) => ruler.measureText(w).width)), room: h.parentElement!.clientWidth, font: parseFloat(style.fontSize), body: parseFloat(getComputedStyle(document.documentElement).fontSize) };
          });
          expect.soft(size.font, `${saved} ${path} heading at ${percent}%`).toBeGreaterThanOrEqual(size.body);
          if (percent === 200) expect.soft(size.widest, `${saved} ${path} heading's words at 200%`).toBeLessThanOrEqual(size.room);
        }
        // Me's reminder reads whole in a 12-hour browser (this one's en-US), with its PM: a
        // clipped one makes 21:00 read "09:00" (Web Tester, #206).
        await page.goto(`${route}/app/me`);
        // Measured once it's laid out: read while the page is still arriving, it's 0 wide.
        const field = page.getByTestId("me-reminder-time");
        await expect(field).toBeVisible();
        await expect.poll(() => field.evaluate((input) => input.clientWidth), { message: `${saved} Me's time at ${percent}%` }).toBeGreaterThan(0);
        const time = await field.evaluate((input) => {
          const style = getComputedStyle(input);
          const ruler = document.createElement("canvas").getContext("2d")!;
          ruler.font = style.font;
          const needs = ruler.measureText("09:00 PM").width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.fontSize) * 1.5;
          return { needs: Math.ceil(needs), has: Math.floor(input.clientWidth) };
        });
        console.log(`Me's time, ${saved} at ${percent}%: needs ${time.needs}, has ${time.has}`);
        expect.soft(time.needs, `${saved} Me's time at ${percent}%`).toBeLessThanOrEqual(time.has);
      }
      // List, for the next person and the next language.
      await textAt(100);
      await page.goto(`${route}/app/timeline`);
      await page.getByTestId("timeline-view-list").click();
    }
  } finally {
    await cleanup(email);
  }
});

// The journal's couldn't-load state had its help below the first screen at 320 px and 300 %
// (Web Tester, #267): it's right under the heading now. Measured on the test-only page, the
// component alone inside the journal layout, as every journal page shows it.
test("large text, set in the browser: the couldn't-load state's help is in the first view on a 320 px phone", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Page.setFontSizes is Chromium's");
  test.setTimeout(120_000);
  const email = newEmail();
  const password = newPassword();
  const cdp = await page.context().newCDPSession(page);
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    await page.setViewportSize({ width: 320, height: 640 });
    // fr and es too: their Try again pushed the page sideways at 300 % (Web Tester, #269).
    for (const [route, saved] of [["", "en"], ["/pt-br", "pt"], ["/fr", "fr"], ["/es", "es"]] as const) {
      await setProfileLocale(email, password, saved);
      for (const percent of [100, 300]) {
        await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
        await page.goto(`${route}/app/test/unavailable`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${saved} at ${percent} %: nothing sideways`).toBe(0);
        const retry = (await page.getByTestId("try-again").boundingBox())!;
        expect(retry.x + retry.width, `${saved} at ${percent} %: Try again inside the width`).toBeLessThanOrEqual(320.5);
        await expect(page.getByTestId("journal-unavailable"), `${saved} at ${percent} %`).toBeVisible();
        const box = (await page.getByTestId("journal-unavailable-help").boundingBox())!;
        // Above the fixed tab bar, which covers the window's foot on a phone.
        const bar = (await page.locator("nav.fixed").first().boundingBox())?.y ?? 640;
        expect(box.y, `${saved} at ${percent} %: help's top in the first view`).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, `${saved} at ${percent} %: help's bottom above the tab bar (${Math.round(bar)} px)`).toBeLessThanOrEqual(Math.min(640, bar));
        expect(box.x + box.width, `${saved} at ${percent} %: help inside the width`).toBeLessThanOrEqual(320.5);
      }
    }
  } finally {
    await cleanup(email);
  }
});

// A column of letters under an X above the window, and Not now 1,660 px down (Web Tester, #218).
test("large text, set in the browser: the milestone's title, X and Not now stay usable on a 320 px phone", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Page.setFontSizes is Chromium's");
  test.setTimeout(240_000);
  const email = newEmail();
  const password = newPassword();
  const cdp = await page.context().newCDPSession(page);
  const textAt = (percent: number) => cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    // 30 days journaled, all in the past: the first milestone.
    const day = await lastWeekMonday(email);
    await seedCheckIns(email, password, day, Array.from({ length: 30 }, (_, i) => ({ offset: -i, mood: 3 })));
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const percent of [100, 200, 300]) {
      await textAt(percent);
      await page.goto("/app");
      const card = page.getByTestId("milestone-card");
      await expect(card, `${percent} %`).toBeVisible({ timeout: 15_000 });
      const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
      const shape = await box("milestone-card");
      expect(shape.y, `${percent} %: the card's top is in the window`).toBeGreaterThanOrEqual(0);
      const close = await box("milestone-close");
      expect(close.y, `${percent} %: the X is in the window`).toBeGreaterThanOrEqual(0);
      expect(close.x + close.width, `${percent} %: the X is in the card`).toBeLessThanOrEqual(shape.x + shape.width);
      expect(close.width, `${percent} %: the X stays its size`).toBe(44);
      const title = (await page.locator("#milestone-title").boundingBox())!;
      expect(title.width, `${percent} %: the title keeps its width`).toBeGreaterThanOrEqual(150);
      const notNow = await box("milestone-not-now");
      expect(notNow.y + notNow.height, `${percent} %: Not now is in view on opening`).toBeLessThanOrEqual(shape.y + shape.height);
      expect(await card.evaluate((el) => el.scrollWidth - el.clientWidth), `${percent} %: no sideways scroll in the card`).toBe(0);
    }
    await page.getByTestId("milestone-close").click();
    await expect(page.getByTestId("milestone-card")).toBeHidden();
  } finally {
    await cleanup(email);
  }
});

// Two columns cut the mood off: "Bad" read "Bac" at 200 %, and it was gone at 300 % (Web Tester).
test("large text, set in the browser: the check-in conflict dialog shows the whole mood on a 320 px phone", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Page.setFontSizes is Chromium's");
  test.setTimeout(300_000);
  const email = newEmail();
  const password = newPassword();
  const cdp = await page.context().newCDPSession(page);
  const textAt = (percent: number) => cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    const today = await journalToday(email, password);
    await seedCheckIns(email, password, today, [{ offset: 0, mood: 4 }]);
    await page.setViewportSize({ width: 320, height: 640 });

    for (const [route, saved] of [["", "en"], ["/fr", "fr"], ["/es", "es"], ["/pt-br", "pt"]]) {
      await setProfileLocale(email, password, saved);
      for (const percent of [100, 200, 300]) {
        await textAt(percent);
        await page.goto(`${route}/app`);
        await page.getByTestId("checkin-edit").click();
        await page.getByTestId("checkin-mood-2").click();
        // Changed elsewhere while this copy was open: the save asks, with both versions.
        await seedCheckIns(email, password, today, [{ offset: 0, mood: percent === 200 ? 3 : 5 }]);
        const fontSize = (el: Element) => getComputedStyle(el).fontSize;
        expect(await page.getByTestId("checkin-save").evaluate(fontSize), `Save, ${route} ${percent} %`).toBe(percent === 100 ? "16px" : "32px");
        await page.getByTestId("checkin-save").click();
        await expect(page.getByTestId("checkin-conflict-dialog"), `${route} ${percent} %`).toBeVisible({ timeout: 15_000 });
        // Stops growing like the page behind it, nothing's cut off, and both choices can be reached.
        const dialog = page.getByTestId("checkin-conflict-dialog");
        expect(await dialog.evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el.querySelector("h2")!).fontSize, getComputedStyle(el.querySelector("[data-testid=checkin-conflict-date]")!).fontSize, el.scrollWidth - el.clientWidth]), `the dialog, ${route} ${percent} %`).toEqual(percent === 100 ? ["16px", "18px", "14px", 0] : ["32px", "35.2px", "28px", 0]);
        for (const id of ["checkin-conflict-use-other", "checkin-conflict-keep-mine"]) {
          await page.getByTestId(id).scrollIntoViewIfNeeded();
          await expect(page.getByTestId(id), `${id}, ${route} ${percent} %`).toBeInViewport();
        }
        for (const side of ["mine", "other"]) {
          const where = `${route || "/"} ${percent} %, ${side}`;
          const card = page.getByTestId(`checkin-conflict-${side}`);
          const word = page.getByTestId(`checkin-conflict-${side}-mood`);
          // Stops growing at about 200 % (decision 231), and the same at normal size.
          expect(await card.evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el.querySelector("p")!).fontSize]), where).toEqual(percent === 100 ? ["16px", "14px"] : ["32px", "28px"]);
          await expect(word, where).toHaveText(/\S/);
          const fit = await word.evaluate((el, cardId) => {
            // Word by word: "Pas bien" may wrap between its words, never inside one.
            const text = el.firstChild as Text;
            const rects = [...text.data.matchAll(/\S+/g)].map((m) => {
              const range = document.createRange();
              range.setStart(text, m.index);
              range.setEnd(text, m.index + m[0].length);
              return [...range.getClientRects()];
            });
            const box = document.querySelector(`[data-testid="${cardId}"]`)!.getBoundingClientRect();
            const all = rects.flat();
            return {
              wordsSplit: rects.filter((r) => r.length !== 1).length,
              inside: all.every((r) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5),
              inWindow: all.every((r) => r.right <= innerWidth + 0.5),
            };
          }, `checkin-conflict-${side}`);
          expect.soft(fit, where).toEqual({ wordsSplit: 0, inside: true, inWindow: true });
          await expect(card, where).toBeVisible();
        }
        if (percent > 100) {
          const mine = (await page.getByTestId("checkin-conflict-mine").boundingBox())!;
          const other = (await page.getByTestId("checkin-conflict-other").boundingBox())!;
          expect.soft(other.y, `${route || "/"} ${percent} %: stacked`).toBeGreaterThan(mine.y + mine.height - 1);
        }
        expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${route || "/"} ${percent} %`).toBe(0);
        await page.getByTestId("checkin-conflict-use-other").click();
        await expect(page.getByTestId("checkin-conflict-dialog")).toHaveCount(0);
      }
    }
    // On a phone the entry's visible Save is the top one: the bottom one is hidden (Web Tester, #253).
    // Its words stay whole: "Enregistr / er" was French's at 32 px, with too much padding.
    const splitWords = (el: Element) => {
      if (!el.isConnected) return null;
      const text = el.firstChild!;
      return [...(text.textContent ?? "").matchAll(/\S+/g)].filter((word) => {
        const range = document.createRange();
        range.setStart(text, word.index);
        range.setEnd(text, word.index + word[0].length);
        return new Set([...range.getClientRects()].map((rect) => rect.top)).size > 1;
      }).map((word) => word[0]);
    };
    for (const [route, saved] of [["", "en"], ["/fr", "fr"], ["/es", "es"], ["/pt-br", "pt"]]) {
      await setProfileLocale(email, password, saved);
      for (const percent of [100, 300]) {
        const where = `${route || "/"} ${percent} %`;
        await textAt(percent);
        await page.goto(`${route}/app/write`);
        const top = page.getByTestId("entry-save-top");
        await expect(top).toBeVisible();
        await expect(page.getByTestId("entry-save")).toBeHidden();
        const size = percent === 100 ? "16px" : "32px";
        for (const button of [top, page.getByTestId("entry-cancel")]) {
          // Both retry: the page can swap the button out as it settles, and a detached one reads as "".
          await expect(button, where).toHaveCSS("font-size", size);
          await expect.poll(() => button.evaluate(splitWords), where).toEqual([]);
        }
      }
    }
  } finally {
    await cleanup(email);
  }
});

// Every new account passes through Set up; its time field was 151 px past a 320 px
// phone at 300 % (Web Tester, #206).
test("large text, set in the browser: Set up stays inside a 320 px phone", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Page.setFontSizes is Chromium's");
  const email = newEmail();
  const password = newPassword();
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    const cdp = await page.context().newCDPSession(page);
    await page.setViewportSize({ width: 320, height: 800 });
    for (const [route, saved] of [["", "en"], ["/fr", "fr"], ["/de", "de"]]) {
      await setProfileLocale(email, password, saved);
      for (const percent of [200, 300]) {
        await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
        await page.goto(`${route}/setup`);
        await expect(page.getByTestId("setup-done")).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect.soft({ saved, percent, overflow }).toEqual({ saved, percent, overflow: 0 });
        // The time reads whole in a 12-hour browser (this one's en-US): its text, sides and
        // picker icon, measured. A clipped PM makes 21:00 read "09:00" (Web Tester, #206).
        const time = await page.getByTestId("setup-reminder-time").evaluate((input) => {
          const style = getComputedStyle(input);
          const ruler = document.createElement("canvas").getContext("2d")!;
          ruler.font = style.font;
          const needs = ruler.measureText("09:00 PM").width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.fontSize) * 1.5;
          return { needs: Math.ceil(needs), has: Math.floor(input.clientWidth), font: style.fontSize };
        });
        console.log(`Set up's time, ${saved} at ${percent}%: needs ${time.needs}, has ${time.has}, font ${time.font}`);
        expect.soft(time.needs, `${saved} at ${percent}%`).toBeLessThanOrEqual(time.has);
      }
    }
  } finally {
    await cleanup(email);
  }
});

// Someone has to dial it: a number never breaks across lines, and its line stays at 28 px or more (#247, UX).
// Tagged: ci.yml runs it where the numbers or the card change, and daily.
test("large text: every help number on the list stays whole on a phone", { tag: "@help-numbers" }, async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Page.setFontSizes is Chromium's");
  test.setTimeout(300_000);
  const email = newEmail();
  const cdp = await page.context().newCDPSession(page);
  try {
    const password = await accountAtSetup(page, email);
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    const saveProfile = await profileSaver(email, password);
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });
    // The help button on Me: its words whole, at the capped size, and on the first screen.
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 640 });
      for (const [route, saved] of [["/en", "en"], ["/fr", "fr"], ["/es", "es"], ["/pt-br", "pt"]]) {
        await saveProfile({ p_locale: saved });
        await page.goto(`${route}/app/me`);
        const button = await page.getByTestId("me-get-help").evaluate((el) => {
          const text = el.firstChild as Text;
          const split = [...text.data.matchAll(/\S+/g)].filter((word) => {
            const range = document.createRange();
            range.setStart(text, word.index);
            range.setEnd(text, word.index + word[0].length);
            return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1;
          }).map((word) => word[0]);
          return { split, size: parseFloat(getComputedStyle(el).fontSize) <= Math.max(innerWidth / 10, 32), onScreen: el.getBoundingClientRect().bottom <= innerHeight };
        });
        expect.soft(button, `Me's help button, ${route} at ${width} px`).toEqual({ split: [], size: true, onScreen: true });
      }
    }
    for (const { code, helpline, emergency } of countries.countries) {
      await saveProfile({ p_country: code });
      // /en, not /: from /pt-br the cookie sends / back there, and the saved-language page won't
      // move to the same language twice in a row, so it stays on its link (#179).
      for (const [route, saved] of [["/en", "en"], ["/fr", "fr"], ["/es", "es"], ["/pt-br", "pt"]]) {
        await saveProfile({ p_locale: saved });
        await page.goto(`${route}/app/me`);
        await page.getByTestId("me-get-help").click({ timeout: 15_000 });
        await expect(page.getByTestId("safety-card"), `${code} ${route}`).toBeVisible();
        for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: 640 });
          for (const [id, display] of [["safety-call-helpline", helpline?.display], ["safety-call-emergency", emergency?.display]]) {
            if (!display) continue;
            const fit = await page.getByTestId(id!).evaluate((el, plain) => {
              // With plain spaces, as they're copied.
              const number = el.querySelector("[data-help-number]");
              if (number?.textContent !== plain) return { found: false };
              // The brackets stay with it.
              const before = number.previousSibling as Text | null;
              const after = number.nextSibling as Text | null;
              const range = document.createRange();
              if (before?.data.endsWith("(")) range.setStart(before, before.data.length - 1);
              else range.setStartBefore(number);
              if (after?.data.startsWith(")")) range.setEnd(after, 1);
              else range.setEndAfter(number);
              const rects = [...range.getClientRects()];
              const box = el.closest("[data-testid=safety-card]")!;
              const inner = box.getBoundingClientRect().right - parseFloat(getComputedStyle(box).paddingRight);
              return {
                found: true,
                lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
                inside: rects.every((rect) => rect.right <= inner + 1),
                readable: parseFloat(getComputedStyle(el).fontSize) >= 28,
              };
            }, display);
            expect.soft(fit, `${code} ${id} ${route} at ${width} px`).toEqual({ found: true, lines: 1, inside: true, readable: true });
          }
          if (width === 320) {
            const first = await page.getByTestId("safety-card").evaluate(firstLinkOnScreen);
            expect.soft(first.tappable, `${code}'s first help line can be tapped on the first screen, ${route}`).toBe(true);
            expect.soft(first.over, `px of ${code}'s first help line past the first screen, ${route}`).toBeLessThanOrEqual(FIRST_LINK_OVER[`${code} ${route}`] ?? 0);
            if (first.over > 0) console.log(`${code} ${route}: first help line ${first.over} px under the fade`);
          }
        }
      }
    }
  } finally {
    await cleanup(email);
  }
});

// Print this month at 320 px and 300 % (Web Tester, #274): the help button and the month's title
// stay inside the page (an automatic layout table grew to the title's longest word and carried
// the button 43 px past it), help in the first view, nothing to scroll sideways.
// The Timeline doesn't move once it has painted (the Web Tester's performance pass, 12 Nov: CLS
// 0.176 about 5 s in, when "Share this month" appeared after its count and wrapped the month's
// header). A month with enough check-ins for a card, on a phone: every layout shift not caused by
// input, summed over 8 s after landing.
test("the Timeline doesn't shift when Share this month arrives (CLS)", async ({ page, browserName }) => {
  test.setTimeout(120_000);
  test.skip(browserName !== "chromium", "layout-shift entries are Chromium's");
  const email = newEmail();
  try {
    // Signing in lands on Today now (Setup is later, #314): no Setup to finish first.
    const password = await accountAtSetup(page, email);
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    // Five check-ins on the 1st to the 5th of last month: always past, one month, enough for a card.
    const today = await journalToday(email, password);
    const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    first.setUTCMonth(first.getUTCMonth() - 1);
    const month = first.toISOString().slice(0, 7);
    await seedCheckIns(email, password, `${month}-01`, [0, 1, 2, 3, 4].map((offset) => ({ offset, mood: 4 })));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const w = window as unknown as { __shift: number };
      w.__shift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!entry.hadRecentInput) w.__shift += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/app/timeline");
    // The share link has arrived (its count is done)...
    await expect(page.getByTestId(`timeline-share-${month}`)).toBeVisible({ timeout: 15_000 });
    // ...and a few more seconds for anything later.
    await page.waitForTimeout(8_000);
    const shift = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);
    console.log(`Timeline CLS after landing: ${shift.toFixed(4)}`);
    expect(shift).toBeLessThanOrEqual(0.01);
  } finally {
    await cleanup(email);
  }
});

test("large text, set in the browser: Print this month stays inside a 320 px phone, help first", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Page.setFontSizes is Chromium's");
  test.setTimeout(180_000);
  const email = newEmail();
  const password = newPassword();
  const cdp = await page.context().newCDPSession(page);
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    const month = (await journalToday(email, password)).slice(0, 7);
    await page.setViewportSize({ width: 320, height: 640 });
    for (const [route, saved] of [["", "en"], ["/pt-br", "pt"]] as const) {
      await setProfileLocale(email, password, saved);
      for (const percent of [100, 300]) {
        const where = `${saved} at ${percent} %`;
        await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
        await page.goto(`${route}/app/print/${month}`);
        const help = page.getByTestId("print-get-help");
        await expect(help, where).toBeVisible();
        const box = (await help.boundingBox())!;
        expect(box.x + box.width, `${where}: help inside the width`).toBeLessThanOrEqual(320.5);
        expect(box.y + box.height, `${where}: help in the first view`).toBeLessThanOrEqual(640);
        const title = (await page.locator("h1").first().boundingBox())!;
        expect(title.x + title.width, `${where}: the title inside the width`).toBeLessThanOrEqual(320.5);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${where}: no sideways scroll`).toBeLessThanOrEqual(320);
      }
    }
    // No serious or critical axe violation, at 320 and 1280 px, at the normal size (UX, 2026-11-12).
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 16, fixed: 13 } });
    for (const [route, saved] of [["", "en"], ["/pt-br", "pt"]] as const) {
      await setProfileLocale(email, password, saved);
      await axeAtWidths(page, `Print this month (${saved})`, async () => {
        await page.goto(`${route}/app/print/${month}`);
        await expect(page.getByTestId("print-get-help")).toBeVisible();
      });
    }
  } finally {
    await cleanup(email);
  }
});

// The Plus screen at 300 % on a 320 × 640 phone (the Web Tester's long-language pass, UX 12 Nov):
// the table had a 36 px slit under a footer of 1,009 px. Now the page scrolls as a whole, the
// phone bar steps aside, and only the price, the renewal line and the button stay pinned: the
// content gets at least 40 % of the screen, and the price, the renewal line and the button are in view on
// landing. With Plus nothing is pinned, and Manage is at the end. Leaving gives the bar back.
test("large text: the Plus screen at 300 % on a 320 px phone, free and in the free week, en and de", async ({ page, browserName }) => {
  test.setTimeout(240_000);
  test.skip(browserName !== "chromium", "Page.setFontSizes is Chromium's");
  test.skip(!(await plusOnStaging()), "staging doesn't have 028's entitlements table yet: the Plus pages can't be read there");
  const email = newEmail();
  const password = newPassword();
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    await page.setViewportSize({ width: 320, height: 640 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });
    const inView = (testId: string) =>
      page.getByTestId(testId).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight + 0.5;
      });
    const open = async (route: string) => {
      await page.goto(`${route}/app/me/plus`);
      await expect(page.getByTestId("plus-title")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("plus-screen")).toHaveAttribute("data-large", "true");
      await expect(page.getByTestId("app-nav")).toBeHidden();
      // What sticks out, named, so a failure says where.
      const wide = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sticksOut: [...document.querySelectorAll("main *")]
          .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5 && e.getBoundingClientRect().width > 1 && !e.classList.contains("sr-only"))
          .slice(0, 4)
          .map((e) => `${e.tagName.toLowerCase()}${e.getAttribute("data-testid") ? `[${e.getAttribute("data-testid")}]` : ""} "${(e.textContent ?? "").trim().slice(0, 24)}" ${Math.round(e.getBoundingClientRect().right)}`),
      }));
      expect(wide, `${route || "/en"}: nothing scrolls sideways`).toEqual({ overflow: 0, sticksOut: [] });
    };
    for (const [route, saved] of [["", "en"], ["/de", "de"]] as const) {
      await setProfileLocale(email, password, saved);
      await open(route);
      // Free: the pinned footer leaves the content at least 40 % of the screen.
      const sizes = await page.evaluate(() => {
        const h = (id: string) => Math.round(document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().height ?? -1);
        return { footer: h("plus-footer"), price: h("plus-price"), renews: h("plus-renews"), button: h("plus-start"), viewport: window.innerHeight };
      });
      const top = await page.getByTestId("plus-footer").evaluate((el) => el.getBoundingClientRect().top / window.innerHeight);
      console.log(`Plus screen at 300 %, ${saved}, free: content ${Math.round(top * 100)} % of the screen; ${JSON.stringify(sizes)}`);
      // UX, 12 Nov, from the first run's numbers (46 % in en): at least 40 % for the content, the
      // table scrolling, rather than squeezing the renewal disclosure out of the pinned part.
      expect(top, `${saved}: the content takes ${Math.round(top * 100)} % of the screen`).toBeGreaterThanOrEqual(0.4);
      expect(await inView("plus-price"), `${saved}: the price on landing`).toBe(true);
      expect(await inView("plus-renews"), `${saved}: the renewal line on landing`).toBe(true);
      expect(await inView("plus-start"), `${saved}: the button on landing`).toBe(true);
      // The whole title in view on landing, above the pinned part, never behind it (UX, 12 Nov: de
      // had it at 304 px under a pinned part starting at 276).
      const title = await page.evaluate(() => {
        const t = document.querySelector('[data-testid="plus-title"]')!.getBoundingClientRect();
        const pinnedTop = document.querySelector('[data-testid="plus-footer"]')!.getBoundingClientRect().top;
        return { top: Math.round(t.top), bottom: Math.round(t.bottom), pinnedTop: Math.round(pinnedTop) };
      });
      console.log(`Plus screen at 300 %, ${saved}, free: the title ${JSON.stringify(title)}`);
      expect(title.top, `${saved}: the title's top on screen`).toBeGreaterThanOrEqual(0);
      expect(title.bottom, `${saved}: the title above the pinned part`).toBeLessThanOrEqual(title.pinnedTop);
      await expect(page.getByTestId("plus-footer").getByTestId("plus-not-now")).toHaveCount(0);
      // At the very end of the page: the pinned part still on screen, and Not now and the site's
      // footer above it, not under it.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const end = await page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
        const pinned = box('[data-testid="plus-footer"]')!;
        const notNow = box('[data-testid="plus-rest"] [data-testid="plus-not-now"]')!;
        // The site's own footer: the page's last <footer>.
        const siteFooter = [...document.querySelectorAll("footer")].at(-1)?.getBoundingClientRect();
        return {
          pinnedOnScreen: pinned.top >= 0 && pinned.bottom <= window.innerHeight + 0.5,
          notNowAbove: notNow.bottom <= pinned.top + 0.5,
          siteFooterAbove: !siteFooter || siteFooter.bottom <= pinned.top + 0.5,
        };
      });
      expect(end, `${saved}: at the very end`).toEqual({ pinnedOnScreen: true, notNowAbove: true, siteFooterAbove: true });
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    // A short screen (320 × 480) at 300 %: the compact pinned part would leave the content under
    // 40 %, so nothing is pinned (UX 12 Nov, specs/plus.md): one scroll, ending with the price,
    // the renewal line and the button together, below Not now; nothing scrolls sideways.
    await page.setViewportSize({ width: 320, height: 480 });
    for (const [route, saved] of [["", "en"], ["/de", "de"]] as const) {
      await setProfileLocale(email, password, saved);
      await open(route);
      await expect(page.getByTestId("plus-screen")).toHaveAttribute("data-unpinned", "true");
      expect(await page.getByTestId("plus-footer").evaluate((el) => getComputedStyle(el).position), `${saved}: not pinned`).not.toBe("fixed");
      // The three together at the end of the Plus content (the site's own footer follows the page,
      // as everywhere): scrolled to, all three are on screen at once.
      await page.getByTestId("plus-footer").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      for (const id of ["plus-price", "plus-renews", "plus-start"]) expect(await inView(id), `${saved}, short screen, at the end: ${id} in view`).toBe(true);
      expect(await page.getByTestId("plus-screen").evaluate((el) => el.lastElementChild?.getAttribute("data-testid")), `${saved}: the price block ends the Plus screen`).toBe("plus-footer");
      const order = await page.evaluate(() => {
        const top = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().top;
        return { notNowFirst: top('[data-testid="plus-rest"] [data-testid="plus-not-now"]') < top('[data-testid="plus-price"]') };
      });
      expect(order, `${saved}, short screen: Not now before the price`).toEqual({ notNowFirst: true });
      console.log(`Plus screen at 300 % on 320 × 480, ${saved}, free: unpinned`);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    // 200 % on 320 × 640 (UX 12 Nov, after the app's Plus screen gave its list too little room
    // there): free, en and de, whichever layout the page picks, the content above the price keeps
    // at least 40 % of the screen, with the price, the renewal line and the button in view on landing.
    await page.setViewportSize({ width: 320, height: 640 });
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
    for (const [route, saved] of [["", "en"], ["/de", "de"]] as const) {
      await setProfileLocale(email, password, saved);
      await page.goto(`${route}/app/me/plus`);
      await expect(page.getByTestId("plus-title")).toBeVisible({ timeout: 15_000 });
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), `${saved}: the text really is at 200 %`).toBe("32px");
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const at200 = await page.evaluate(() => {
        const footer = document.querySelector('[data-testid="plus-footer"]')!.getBoundingClientRect();
        const root = document.querySelector('[data-testid="plus-screen"]')!;
        return {
          large: root.hasAttribute("data-large"),
          unpinned: root.hasAttribute("data-unpinned"),
          content: Math.round((footer.top / window.innerHeight) * 100),
          footer: Math.round(footer.height),
          viewport: window.innerHeight,
        };
      });
      console.log(`Plus screen at 200 %, ${saved}, free: ${JSON.stringify(at200)}`);
      expect(at200.unpinned, `${saved} at 200 %: still pinned on a 640 px screen`).toBe(false);
      expect(at200.content, `${saved} at 200 %: the content takes ${at200.content} % of the screen`).toBeGreaterThanOrEqual(40);
      for (const id of ["plus-price", "plus-renews", "plus-start"]) expect(await inView(id), `${saved} at 200 %: ${id} on landing`).toBe(true);
    }
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });
    // Not now really taps Not now on the short screen (the Web Tester, #311: when it stayed pinned
    // over 68 % of the screen, a tap on Not now landed on Start).
    await page.setViewportSize({ width: 320, height: 480 });
    await setProfileLocale(email, password, "de");
    await open("/de");
    await expect(page.getByTestId("plus-screen")).toHaveAttribute("data-unpinned", "true");
    await page.getByTestId("plus-rest").getByTestId("plus-not-now").scrollIntoViewIfNeeded();
    const hit = await page.getByTestId("plus-rest").getByTestId("plus-not-now").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("[data-testid]")?.getAttribute("data-testid");
    });
    expect(hit, "de, 320 × 480 at 300 %: the point under Not now is Not now").toBe("plus-not-now");
    await page.getByTestId("plus-rest").getByTestId("plus-not-now").click();
    await expect(page).toHaveURL(RegExp("/de/app/me$"), { timeout: 15_000 });
    await page.setViewportSize({ width: 320, height: 640 });
    await grantPlusTrial(email);
    for (const [route, saved] of [["", "en"], ["/de", "de"]] as const) {
      await setProfileLocale(email, password, saved);
      await open(route);
      // In the free week: nothing pinned, so the content has the whole screen; Manage at the end.
      await expect(page.getByTestId("plus-footer")).toHaveCount(0);
      await page.getByTestId("plus-rest").getByTestId("plus-manage").scrollIntoViewIfNeeded();
      await expect(page.getByTestId("plus-manage")).toBeVisible();
    }
    // Leaving the Plus screen by its own Back (no reload) gives the phone bar back.
    await page.getByTestId("nav-back").click();
    await expect(page).toHaveURL(/\/app\/me$/, { timeout: 15_000 });
    await expect(page.getByTestId("app-nav")).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-tabs-aside"))).toBe(false);
  } finally {
    await cleanup(email);
  }
});

// Automated accessibility (UX, 2026-11-12): no serious or critical axe violation on Moodbow Plus, its screen and sheet, at
// 320 and 1280 px, in en and pt-BR. Skipped, saying so, until staging has 028's entitlements.
test("axe: Moodbow Plus, its screen and sheet, at 320 and 1280 px", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!(await plusOnStaging()), "staging doesn't have 028's entitlements table yet: the Plus pages can't be read there");
  const email = newEmail();
  const password = newPassword();
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    for (const [route, saved] of [["", "en"], ["/pt-br", "pt"]] as const) {
      await setProfileLocale(email, password, saved);
      await axeAtWidths(page, `Plus screen, free (${saved})`, async () => {
        await page.goto(`${route}/app/me/plus`);
        await expect(page.getByTestId("plus-screen")).toBeVisible({ timeout: 15_000 });
      });
      await axeAtWidths(page, `Plus sheet, from Insights' Year (${saved})`, async () => {
        await page.goto(`${route}/app/insights`);
        await page.getByTestId("insights-range-year").click();
        await expect(page.getByTestId("plus-sheet-go")).toBeVisible({ timeout: 15_000 });
      });
    }
    await grantPlusTrial(email);
    for (const [route, saved] of [["", "en"], ["/pt-br", "pt"]] as const) {
      await setProfileLocale(email, password, saved);
      await axeAtWidths(page, `Plus screen, in the free week (${saved})`, async () => {
        await page.goto(`${route}/app/me/plus`);
        await expect(page.getByTestId("plus-screen")).toBeVisible({ timeout: 15_000 });
      });
    }
  } finally {
    await cleanup(email);
  }
});

// Automated accessibility (UX, 2026-11-12): no serious or critical axe violation on Plus's Year, All time and More patterns, at
// 320 and 1280 px, in en and pt-BR. Skipped, saying so, until staging has 028's entitlements.
test("axe: Plus's Year, All time and More patterns, at 320 and 1280 px", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!(await plusOnStaging()), "staging doesn't have 028's entitlements table yet: the Plus pages can't be read there");
  const email = newEmail();
  const password = newPassword();
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    await grantPlusTrial(email);
    for (const [route, saved] of [["", "en"], ["/pt-br", "pt"]] as const) {
      await setProfileLocale(email, password, saved);
      await axeAtWidths(page, `Insights, Year (${saved})`, async () => {
        await page.goto(`${route}/app/insights?range=year`);
        await expect(page.getByTestId("insights-long-heading")).toBeVisible({ timeout: 15_000 });
      });
      await axeAtWidths(page, `Insights, All time (${saved})`, async () => {
        await page.goto(`${route}/app/insights?range=all`);
        await expect(page.getByTestId("insights-long-heading")).toBeVisible({ timeout: 15_000 });
      });
      await axeAtWidths(page, `More patterns (${saved})`, async () => {
        await page.goto(`${route}/app/insights?range=year`);
        // The card is always there; its "none yet" line sits inside it, so an .or() of the two matches both.
        await expect(page.getByTestId("insights-more-patterns-card")).toBeVisible({ timeout: 15_000 });
      });
    }
  } finally {
    await cleanup(email);
  }
});

// Automated accessibility (UX, 2026-11-12): no serious or critical axe violation on the PDF journal page, at
// 320 and 1280 px, in en and pt-BR. Skipped, saying so, until staging has 028's entitlements.
test("axe: the PDF journal page, at 320 and 1280 px", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!(await plusOnStaging()), "staging doesn't have 028's entitlements table yet: the Plus pages can't be read there");
  const email = newEmail();
  const password = newPassword();
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    await grantPlusTrial(email);
    for (const [route, saved] of [["", "en"], ["/pt-br", "pt"]] as const) {
      await setProfileLocale(email, password, saved);
      await axeAtWidths(page, `PDF journal (${saved})`, async () => {
        await page.goto(`${route}/app/me/journal-pdf`);
        await expect(page.getByTestId("pdf-get-help")).toBeVisible({ timeout: 15_000 });
      });
    }
  } finally {
    await cleanup(email);
  }
});

// Automated accessibility (UX, 2026-11-12): no serious or critical axe violation on Year in review, at
// 320 and 1280 px, in en and pt-BR. Skipped, saying so, until staging has 028's entitlements.
test("axe: Year in review, at 320 and 1280 px", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!(await plusOnStaging()), "staging doesn't have 028's entitlements table yet: the Plus pages can't be read there");
  const email = newEmail();
  const password = newPassword();
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    await grantPlusTrial(email);
    for (const [route, saved] of [["", "en"], ["/pt-br", "pt"]] as const) {
      await setProfileLocale(email, password, saved);
      await axeAtWidths(page, `Year in review (${saved})`, async () => {
        await page.goto(`${route}/app/insights/review`);
        await expect(page.getByTestId("review-get-help")).toBeVisible({ timeout: 15_000 });
      });
    }
  } finally {
    await cleanup(email);
  }
});

// Automated accessibility (UX, 2026-11-12): no serious or critical axe violation on Appearance with themes, at
// 320 and 1280 px, in en and pt-BR. Skipped, saying so, until staging has 028's entitlements.
test("axe: Appearance with themes, at 320 and 1280 px", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!(await plusOnStaging()), "staging doesn't have 028's entitlements table yet: the Plus pages can't be read there");
  const email = newEmail();
  const password = newPassword();
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    for (const [route, saved] of [["", "en"], ["/pt-br", "pt"]] as const) {
      await setProfileLocale(email, password, saved);
      await axeAtWidths(page, `Appearance, free (the lock) (${saved})`, async () => {
        await page.goto(`${route}/app/me`);
        await expect(page.getByTestId("me-palettes")).toBeVisible({ timeout: 15_000 });
      });
    }
    await grantPlusTrial(email);
    for (const [route, saved] of [["", "en"], ["/pt-br", "pt"]] as const) {
      await setProfileLocale(email, password, saved);
      await axeAtWidths(page, `Appearance, the themes (${saved})`, async () => {
        await page.goto(`${route}/app/me`);
        await expect(page.getByTestId("me-palettes")).toBeVisible({ timeout: 15_000 });
      });
    }
  } finally {
    await cleanup(email);
  }
});

// The reminder time's picker button is the browser's own part inside the field: with focus on it
// the field isn't :focus-visible, and its ring went (WCAG 2.4.7, Web Tester's keyboard pass,
// 12 Nov). Tab through each time field's own stops (hours, minutes, AM/PM, the picker): the
// ring is drawn at every one while focus is inside it. Set up's, then Me's.
test("keyboard: a time field shows its ring at every stop inside it, the picker button too", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "the stops inside a time field are Chromium's");
  const email = newEmail();
  const password = newPassword();
  const ringThroughout = async (testId: string, where: string) => {
    const field = page.getByTestId(testId);
    await field.focus();
    let stops = 0;
    for (let i = 0; i < 8; i++) {
      const state = await field.evaluate((input) => ({ inside: document.activeElement === input, outline: getComputedStyle(input).outlineStyle }));
      if (!state.inside) break;
      stops++;
      expect.soft(state.outline, `${where}, stop ${stops}: the ring`).toBe("solid");
      await page.keyboard.press("Tab");
    }
    console.log(`${where}: ${stops} stops inside the field, each with the ring`);
    // Hours, minutes and the picker at least (a 12-hour browser adds AM/PM).
    expect(stops, `${where}: Tab went through the field's own stops`).toBeGreaterThanOrEqual(3);
  };
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(RegExp("/app$"), { timeout: 20_000 });
    await page.goto("/setup");
    // After first use the reminder is off (the protective default), so its time field is disabled:
    // turn it on first, as someone choosing a time would.
    await page.getByTestId("setup-reminder-off").uncheck();
    await expect(page.getByTestId("setup-reminder-time")).toBeEnabled();
    await ringThroughout("setup-reminder-time", "Set up's reminder time");
    await page.getByTestId("setup-done").click();
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    await page.goto("/app/me");
    await expect(page.getByTestId("me-reminder-time")).toBeEnabled({ timeout: 15_000 });
    // The section takes no input until the page's code has run (useUntilLoaded: inert, which
    // toBeEnabled doesn't see), so a focus before that never lands: wait for it (#266, #286).
    await expect(page.locator('section[aria-labelledby="me-reminder"]')).not.toHaveAttribute("inert", { timeout: 15_000 });
    await ringThroughout("me-reminder-time", "Me's reminder time");
  } finally {
    await cleanup(email);
  }
});

// Write in the first view at large text (UX, 2026-11-12; the pilot checklist's known shortfall):
// at 320 px / 300 % the check-in card runs to ~1,400 px, so Write is also offered under the date.
// It shows only when the text is large for the screen (an em media query), never at 100 %; the
// card and the Write button below it stay as they are.
test("large text, set in the browser: Write is in Today's first view at 320 px, and only at large text", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Page.setFontSizes is Chromium's");
  test.setTimeout(120_000);
  const email = newEmail();
  const password = newPassword();
  const cdp = await page.context().newCDPSession(page);
  try {
    await signedUpUnconfirmed(email, password);
    await confirmEmail(email);
    await page.goto("/sign-in");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("main form button[type=submit]").first().click();
    await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
    await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
    await page.setViewportSize({ width: 320, height: 640 });
    for (const percent of [100, 150, 300]) {
      const where = `${percent} %`;
      // Whole pixels: CDP refuses 19.5 (13 px at 150 %).
      await cdp.send("Page.setFontSizes", { fontSizes: { standard: Math.round((16 * percent) / 100), fixed: Math.round((13 * percent) / 100) } });
      await page.goto("/app");
      await expect(page.getByTestId("checkin-card"), where).toBeVisible();
      // The card's own Write is always there, after it.
      await expect(page.getByTestId("today-write"), where).toHaveCount(1);
      const top = page.getByTestId("today-write-top");
      if (percent === 100) {
        await expect(top, `${where}: no second Write`).toBeHidden();
        continue;
      }
      await expect(top, where).toBeVisible();
      await expect(top, where).toHaveText(messages.entry.writeButton);
      const box = (await top.boundingBox())!;
      const bar = (await page.getByRole("navigation", { name: messages.app.appName }).boundingBox())!;
      // Measured first, so the log says what changed even when a check below fails.
      const card = (await page.getByTestId("checkin-card").boundingBox())!;
      const below = (await page.getByTestId("today-write").boundingBox())!;
      console.log(`Today ${where}: Write at the top ${Math.round(box.y)}–${Math.round(box.y + box.height)} px; the card ${Math.round(card.y)}–${Math.round(card.y + card.height)} px; the Write below it at ${Math.round(below.y)} px; first view ends at ${Math.round(bar.y)} px`);
      expect(box.y + box.height, `${where}: Write above the tab bar, in the first view`).toBeLessThanOrEqual(bar.y);
      expect(box.x + box.width, `${where}: Write inside the width`).toBeLessThanOrEqual(320.5);
      expect(box.height, `${where}: a big enough target`).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${where}: no sideways scroll`).toBeLessThanOrEqual(320);
    }
    // It opens the editor, as the other one does.
    await page.getByTestId("today-write-top").click();
    await expect(page.getByTestId("entry-text")).toBeVisible({ timeout: 15_000 });
  } finally {
    await cleanup(email);
  }
});
