import { expect, test, type Page } from "@playwright/test";
import messages from "../../src/messages/en.json";
import { cleanup, configured, confirmEmail, newEmail, newPassword, notConfigured, recoveryLinkHash, signedUpUnconfirmed } from "./staging";

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
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
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

  test("a draft, clicked into before it loaded: the next letters go after the draft, on a new line", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await onboarded(page, email, password);
      await page.goto("/app/write");
      await box(page).click();
      await page.keyboard.type("The draft");
      await page.waitForTimeout(2_500);
      await beforeLoad(page, "/app/write", async () => {
        await box(page).click();
      });
      await page.keyboard.type("tnci");
      await expect(box(page)).toHaveValue("The draft\n\ntnci");
      await expect(page).toHaveURL(/\/app\/write$/);
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

  // What's typed stays; the consent boxes go back to unticked and Create account waits: nobody
  // consents by something the page didn't take in (UX; 1.3 §6 keeps it on Create account).
  test("sign-up: the email and the password stay; the boxes go back to unticked", async ({ page }) => {
    await beforeLoad(page, "/sign-up", async () => {
      await page.locator("#email").click();
      await page.keyboard.type("a@b.co");
      await page.locator("#password").click();
      await page.keyboard.type("secret123");
      await page.getByTestId("consent-privacy").check();
      await page.getByTestId("consent-health").check();
      await page.getByTestId("consent-age").check();
    });
    await expect(page.locator("#email")).toHaveValue("a@b.co");
    await expect(page.locator("#password")).toHaveValue("secret123");
    for (const id of ["consent-privacy", "consent-health", "consent-age"]) await expect(page.getByTestId(id)).not.toBeChecked();
    await expect(page.getByTestId("signup-submit")).toBeDisabled();
    // It's in the page's state too: one more key, and it's all there.
    await page.locator("#password").click();
    await page.keyboard.press("End");
    await page.keyboard.type("4");
    await expect(page.locator("#password")).toHaveValue("secret1234");
  });

  test("reset password: what was typed stays", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
      await page.goto(`/auth/confirm?token_hash=${await recoveryLinkHash(email)}&type=recovery`);
      await page.locator("main form button[type=submit]").click();
      await expect(page).toHaveURL(/\/auth\/reset-password/, { timeout: 20_000 });
      await beforeLoad(page, "/auth/reset-password", async () => {
        await page.locator("#password").click();
        await page.keyboard.type("a-new-secret");
      });
      await expect(page.locator("#password")).toHaveValue("a-new-secret");
      await expect(page.locator("#password")).toBeFocused();
    } finally {
      await cleanup(email);
    }
  });

  // Ticks before load go back to unticked, and Continue waits: nobody consents
  // by something the page didn't take in (UX). Setup's form reads the page itself.
  test("setup keeps its choices", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
      await signIn(page, email, password);
      await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
      // Setup after first use (1.3 §6): opened from its page.
      await beforeLoad(page, "/setup", async () => {
        await page.getByTestId("setup-reminder-time").fill("07:30");
        await page.getByTestId("setup-reminder-off").check();
      });
      await expect(page.getByTestId("setup-reminder-time")).toHaveValue("07:30");
      await expect(page.getByTestId("setup-reminder-off")).toBeChecked();
    } finally {
      await cleanup(email);
    }
  });

  test("Today and Timeline: a tap does nothing, and there's no search box to type in yet", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await onboarded(page, email, password);
      await beforeLoad(page, "/app", async () => {
        await expect(page.getByTestId("checkin-mood-4")).toBeVisible();
        // The card says it isn't ready (#238); the page around it isn't held.
        await expect(page.getByTestId("checkin-card")).toHaveAttribute("inert", "");
        await expect(page.getByTestId("tab-today").locator("xpath=ancestor-or-self::*[@inert]")).toHaveCount(0);
        // A forced click: a normal one would wait for the card to take it.
        await page.getByTestId("checkin-mood-4").click({ force: true });
      });
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.locator("[data-until-loaded]")).toHaveCount(0);
      await expect(page.getByTestId("checkin-mood-4")).toHaveAttribute("aria-checked", "false");
      await expect(page.getByTestId("checkin-save")).toBeDisabled();
      // Works from here on.
      await page.getByTestId("checkin-mood-4").click();
      await expect(page.getByTestId("checkin-save")).toBeEnabled();
      await beforeLoad(page, "/app/timeline", async () => {
        await expect(page.getByTestId("tab-today")).toBeVisible();
        await expect(page.getByTestId("timeline-search-input")).toHaveCount(0);
      });
    } finally {
      await cleanup(email);
    }
  });

  test("signed in with scripts off: help is still on the page, and leads to the help page", async ({ page, browser, baseURL }) => {
    const email = newEmail();
    const password = newPassword();
    try {
      await onboarded(page, email, password);
      await expect(page.getByTestId("app-noscript-help")).toHaveCount(0);
      const off = await browser.newContext({ baseURL, javaScriptEnabled: false, storageState: await page.context().storageState() });
      const noScript = await off.newPage();
      await noScript.goto("/app/me");
      // Why the page is empty, under the help and not above it.
      const help = (await noScript.getByTestId("app-noscript-help").boundingBox())!;
      const why = (await noScript.getByTestId("app-noscript-journal").boundingBox())!;
      expect(why.y).toBeGreaterThan(help.y);
      // It can be read: at large text on a phone, it scrolls clear of the fixed tab bar.
      await noScript.setViewportSize({ width: 320, height: 640 });
      await (await off.newCDPSession(noScript)).send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });
      await noScript.mouse.wheel(0, 3000);
      await expect.poll(async () => {
        const line = (await noScript.getByTestId("app-noscript-journal").boundingBox())!;
        const bar = (await noScript.locator("nav.fixed").boundingBox())!;
        return line.y + line.height <= bar.y;
      }).toBe(true);
      await noScript.getByTestId("app-noscript-help").click();
      await expect(noScript).toHaveURL(/\/help\/get-help-now$/);
      await expect(noScript.getByTestId("help-now-find-helpline")).toBeVisible();
      await off.close();
    } finally {
      await cleanup(email);
    }
  });

  test("Me: nothing can be changed until it has loaded, so nothing looks saved that isn't", async ({ page }) => {
    const email = newEmail();
    const password = newPassword();
    const sections = ["me-country", "me-reminder-time", "me-theme-dark", "import-file"];
    try {
      await onboarded(page, email, password);
      // Help doesn't wait for any of it (#248).
      await beforeLoad(page, "/app/me", async () => {
        await page.getByTestId("me-get-help").click();
        await expect(page).toHaveURL(/\/help\/get-help-now$/);
        await expect(page.getByTestId("help-now-find-helpline")).toBeVisible();
      });
      await beforeLoad(page, "/app/me", async () => {
        for (const id of sections) {
          await expect(page.getByTestId(id).locator("xpath=ancestor::*[@inert]"), id).toHaveCount(1);
        }
        // A real click where the control is: it doesn't take. A forced click
        // doesn't wait for anything, and the streamed page may not be showing yet.
        await expect(page.getByTestId("me-theme-dark")).toBeVisible();
        await page.getByTestId("me-theme-dark").click({ force: true });
        await expect(page.getByTestId("me-theme-dark")).not.toBeChecked();
      });
      for (const id of sections) {
        await expect(page.getByTestId(id).locator("xpath=ancestor::*[@inert]"), id).toHaveCount(0);
      }
      await expect(page.locator("[data-until-loaded]")).toHaveCount(0);
      await expect(page.getByTestId("me-theme-dark")).not.toBeChecked();
      // And it works from here on, and saves.
      await page.getByTestId("me-country").selectOption("FR");
      await page.waitForTimeout(1_000);
      await page.reload();
      await expect(page.getByTestId("me-country")).toHaveValue("FR");
    } finally {
      await cleanup(email);
    }
  });
});
