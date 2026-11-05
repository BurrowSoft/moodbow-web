import { expect, test, type Page } from "@playwright/test";
import messages from "../../src/messages/en.json";
import { cleanup, configured, confirmEmail, newEmail, newPassword, notConfigured, signedUpUnconfirmed } from "./staging";

// A slow phone: the page has drawn, its code hasn't run, and the person is
// already typing. The page's scripts are held back so this is the same every
// time (no throttle to tune): real key presses, then the scripts arrive.
test.skip(!configured, notConfigured);
test.describe.configure({ timeout: 120_000 });

const SCRIPTS = "**/_next/static/**/*.js";

async function beforeLoad(page: Page, path: string, act: () => Promise<void>): Promise<void> {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(SCRIPTS, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(path, { waitUntil: "commit" });
  await act();
  release();
  await loaded(page);
  await page.unroute(SCRIPTS);
}

// React has taken over the page, and whatever it does right after that is done.
async function loaded(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((k) => k.startsWith("__reactFiber"));
  });
  await page.waitForTimeout(1_000);
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: messages.auth.signinSubmit }).click();
}

async function onboarded(page: Page, email: string, password: string): Promise<void> {
  await signedUpUnconfirmed(email, password);
  await confirmEmail(email);
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
  await page.getByTestId("setup-done").click();
  await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });
}

const box = (page: Page) => page.getByTestId("entry-text");

test.describe("typing before the page has loaded", () => {
  test("a new entry: the text stays, Save works, the caret and focus stay, and the draft has it", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /hydrat/i.test(m.text())) errors.push(m.text());
    });
    try {
      await onboarded(page, email, password);
      await beforeLoad(page, "/app/write", async () => {
        await box(page).click();
        await page.keyboard.type("Typed on a slow phone");
        await expect(page.getByTestId("entry-save")).toBeDisabled();
      });
      await expect(box(page)).toHaveValue("Typed on a slow phone");
      await expect(page.getByTestId("entry-save")).toBeEnabled();
      await expect(box(page)).toBeFocused();
      // Still typing, from where the caret was, with no click.
      await page.keyboard.type(", and on");
      await expect(box(page)).toHaveValue("Typed on a slow phone, and on");
      // The caret in the middle comes through too.
      await page.waitForTimeout(2_500);
      await page.reload();
      await expect(box(page)).toHaveValue("Typed on a slow phone, and on");
      expect(errors).toEqual([]);
    } finally {
      await cleanup(email);
    }
  });

  test("the caret stays where it was, in the middle of the text", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await onboarded(page, email, password);
      await beforeLoad(page, "/app/write", async () => {
        await box(page).click();
        await page.keyboard.type("ac");
        await page.keyboard.press("ArrowLeft");
      });
      await page.keyboard.type("b");
      await expect(box(page)).toHaveValue("abc");
    } finally {
      await cleanup(email);
    }
  });

  test("a draft in this browser: neither it nor what was just typed is lost", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await onboarded(page, email, password);
      await page.goto("/app/write");
      await box(page).click();
      await page.keyboard.type("The draft from before");
      await page.waitForTimeout(2_500);
      await beforeLoad(page, "/app/write", async () => {
        await box(page).click();
        await page.keyboard.type("Typed while it loaded");
      });
      const value = await box(page).inputValue();
      expect(value).toContain("The draft from before");
      expect(value).toContain("Typed while it loaded");
      await expect(page.getByTestId("entry-save")).toBeEnabled();
    } finally {
      await cleanup(email);
    }
  });

  test("a draft, and nothing typed: the draft comes back as before, and nothing is added", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await onboarded(page, email, password);
      await page.goto("/app/write");
      await box(page).click();
      await page.keyboard.type("Only the draft");
      await page.waitForTimeout(2_500);
      await page.reload();
      await expect(box(page)).toHaveValue("Only the draft");
    } finally {
      await cleanup(email);
    }
  });

  // What every other control does. Measures and prints; the asserts follow
  // once the table has been read.
  test("measure: every other control", async ({ page, browser }) => {
    const email = newEmail();
    const password = newPassword();
    const row = (name: string, seen: unknown) => console.log(`[before-load] ${name}: ${JSON.stringify(seen)}`);
    try {
      // Signed out.
      const out = await (await browser.newContext()).newPage();
      await beforeLoad(out, "/sign-in", async () => {
        await out.locator("#email").click();
        await out.keyboard.type("a@b.co");
        await out.locator("#password").click();
        await out.keyboard.type("secret");
      });
      row("sign-in", { email: await out.locator("#email").inputValue(), password: (await out.locator("#password").inputValue()).length });
      await beforeLoad(out, "/forgot-password", async () => {
        await out.locator("#email").click();
        await out.keyboard.type("a@b.co");
      });
      row("forgot-password", { email: await out.locator("#email").inputValue() });
      await beforeLoad(out, "/consent", async () => {
        await out.getByTestId("consent-privacy").check();
        await out.getByTestId("consent-health").check();
      });
      row("consent", { privacy: await out.getByTestId("consent-privacy").isChecked(), health: await out.getByTestId("consent-health").isChecked(), continueDisabled: await out.getByTestId("consent-continue").isDisabled() });
      await out.goto("/consent");
      await out.getByTestId("consent-privacy").check();
      await out.getByTestId("consent-health").check();
      await out.getByTestId("consent-continue").click();
      await expect(out).toHaveURL(/\/sign-up$/);
      await beforeLoad(out, "/sign-up", async () => {
        await out.locator("#email").click();
        await out.keyboard.type("a@b.co");
        await out.locator("#password").click();
        await out.keyboard.type("secret123");
        await out.getByTestId("signup-age").check();
      });
      row("sign-up", { email: await out.locator("#email").inputValue(), password: (await out.locator("#password").inputValue()).length, age: await out.getByTestId("signup-age").isChecked() });

      // Setup.
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
      await signIn(page, email, password);
      await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
      await beforeLoad(page, "/setup", async () => {
        await page.getByTestId("setup-reminder-time").fill("07:30");
        await page.getByTestId("setup-reminder-off").check();
      });
      row("setup", { time: await page.getByTestId("setup-reminder-time").inputValue(), off: await page.getByTestId("setup-reminder-off").isChecked(), timeDisabled: await page.getByTestId("setup-reminder-time").isDisabled() });
      await page.goto("/setup");
      await page.getByTestId("setup-done").click();
      await expect(page.getByTestId("checkin-card")).toBeVisible({ timeout: 15_000 });

      // The journal.
      await beforeLoad(page, "/app", async () => {
        await page.getByTestId("checkin-mood-4").click();
      });
      row("today: a mood tapped", { saveEnabled: await page.getByTestId("checkin-save").isEnabled().catch(() => null), pressed: await page.getByTestId("checkin-mood-4").getAttribute("aria-pressed") });
      await beforeLoad(page, "/app/timeline", async () => {
        await page.getByTestId("timeline-search-input").click();
        await page.keyboard.type("river");
      });
      row("timeline search", { value: await page.getByTestId("timeline-search-input").inputValue(), focused: await page.getByTestId("timeline-search-input").evaluate((el) => el === document.activeElement) });
      await page.keyboard.type("s");
      row("timeline search, one more key", { value: await page.getByTestId("timeline-search-input").inputValue() });
      await beforeLoad(page, "/app/me", async () => {
        await page.getByTestId("me-country").selectOption("FR");
        await page.getByTestId("me-reminder-time").fill("07:30");
        await page.getByTestId("me-theme-dark").check();
      });
      row("me", { country: await page.getByTestId("me-country").inputValue(), time: await page.getByTestId("me-reminder-time").inputValue(), dark: await page.getByTestId("me-theme-dark").isChecked() });
      await page.reload();
      await loaded(page);
      row("me, after a reload (saved?)", { country: await page.getByTestId("me-country").inputValue(), time: await page.getByTestId("me-reminder-time").inputValue(), dark: await page.getByTestId("me-theme-dark").isChecked() });
    } finally {
      await cleanup(email);
    }
  });
});
