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
      // Still typing, from where the caret was, with no click. On the bare page
      // these letters would be keyboard shortcuts (t: Timeline).
      await page.keyboard.type(", tnci");
      await expect(box(page)).toHaveValue("Typed on a slow phone, tnci");
      await expect(page).toHaveURL(/\/app\/write$/);
      // The draft has it.
      await page.waitForTimeout(2_500);
      await page.reload();
      await expect(box(page)).toHaveValue("Typed on a slow phone, tnci");
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

  test("clicked into the box before it loaded, nothing typed yet: the next letters go in the box, not to the shortcuts", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await onboarded(page, email, password);
      await beforeLoad(page, "/app/write", async () => {
        await box(page).click();
      });
      await expect(box(page)).toBeFocused();
      await page.keyboard.type("tnci");
      await expect(box(page)).toHaveValue("tnci");
      await expect(page).toHaveURL(/\/app\/write$/);
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

  test("sign-in and forgot password: what was typed stays", async ({ page }) => {
    await beforeLoad(page, "/sign-in", async () => {
      await page.locator("#email").click();
      await page.keyboard.type("a@b.co");
      await page.locator("#password").click();
      await page.keyboard.type("secret");
    });
    await expect(page.locator("#email")).toHaveValue("a@b.co");
    await expect(page.locator("#password")).toHaveValue("secret");
    await expect(page.locator("#password")).toBeFocused();
    await beforeLoad(page, "/forgot-password", async () => {
      await page.locator("#email").click();
      await page.keyboard.type("a@b.co");
    });
    await expect(page.locator("#email")).toHaveValue("a@b.co");
  });

  test("sign-up: the email, the password and the age box stay", async ({ page }) => {
    await page.goto("/consent");
    await page.getByTestId("consent-privacy").check();
    await page.getByTestId("consent-health").check();
    await page.getByTestId("consent-continue").click();
    await expect(page).toHaveURL(/\/sign-up$/);
    await beforeLoad(page, "/sign-up", async () => {
      await page.locator("#email").click();
      await page.keyboard.type("a@b.co");
      await page.locator("#password").click();
      await page.keyboard.type("secret123");
      await page.getByTestId("signup-age").check();
    });
    await expect(page.locator("#email")).toHaveValue("a@b.co");
    await expect(page.locator("#password")).toHaveValue("secret123");
    await expect(page.getByTestId("signup-age")).toBeChecked();
    // It's in the page's state too: one more key, and it's all there.
    await page.locator("#password").click();
    await page.keyboard.press("End");
    await page.keyboard.type("4");
    await expect(page.locator("#password")).toHaveValue("secret1234");
  });

  // What the journal's other controls do. Measures and prints; the asserts
  // follow once the table has been read.
  test("measure: consent and setup", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    const row = (name: string, seen: unknown) => console.log(`[before-load] ${name}: ${JSON.stringify(seen)}`);
    try {
      await beforeLoad(page, "/consent", async () => {
        await page.getByTestId("consent-privacy").check();
        await page.getByTestId("consent-health").check();
      });
      row("consent", { privacy: await page.getByTestId("consent-privacy").isChecked(), health: await page.getByTestId("consent-health").isChecked(), continueDisabled: await page.getByTestId("consent-continue").isDisabled() });
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
      await signIn(page, email, password);
      await expect(page).toHaveURL(/\/setup$/, { timeout: 20_000 });
      await beforeLoad(page, "/setup", async () => {
        await page.getByTestId("setup-reminder-time").fill("07:30");
        await page.getByTestId("setup-reminder-off").check();
      });
      row("setup", { time: await page.getByTestId("setup-reminder-time").inputValue(), off: await page.getByTestId("setup-reminder-off").isChecked(), timeDisabled: await page.getByTestId("setup-reminder-time").isDisabled() });
    } finally {
      await cleanup(email);
    }
  });

  test("measure: Today, Timeline and Me", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    const row = (name: string, seen: unknown) => console.log(`[before-load] ${name}: ${JSON.stringify(seen)}`);
    try {
      await onboarded(page, email, password);
      await beforeLoad(page, "/app", async () => {
        await page.getByTestId("checkin-mood-4").click();
      });
      row("today: a mood tapped", { saveEnabled: await page.getByTestId("checkin-save").isEnabled().catch(() => null), pressed: await page.getByTestId("checkin-mood-4").getAttribute("aria-pressed"), url: new URL(page.url()).pathname });
      await beforeLoad(page, "/app/timeline", async () => {
        row("timeline: search box in the server's page", { count: await page.getByTestId("timeline-search-input").count() });
      });
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
