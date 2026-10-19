import { expect, test } from "@playwright/test";

// Me → Appearance (decision 133): a choice stored on this device wins over
// the system theme from the first paint (the pre-paint script), and the
// logo follows it. No account, no cookie.
const CREAM = "rgb(251, 246, 241)";
const INK = "rgb(43, 36, 56)";
const bodyBg = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const visibleLogo = (page: import("@playwright/test").Page) => page.locator("img[class^=logo-] >> visible=true").first().getAttribute("class");

test("no choice: the system theme (dark here)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/support");
  expect(await bodyBg(page)).toBe(INK);
  expect(await visibleLogo(page)).toBe("logo-dark");
});

test("Light chosen on a dark system: light from the first paint, light logo", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => window.localStorage.setItem("mb:theme", "light"));
  await page.goto("/support");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
  expect(await bodyBg(page)).toBe(CREAM);
  expect(await visibleLogo(page)).toBe("logo-light");
});

test("Dark chosen on a light system: dark, dark logo; nothing in cookies", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => window.localStorage.setItem("mb:theme", "dark"));
  await page.goto("/support");
  expect(await bodyBg(page)).toBe(INK);
  expect(await visibleLogo(page)).toBe("logo-dark");
  expect((await context.cookies()).some((c) => /theme/i.test(c.name))).toBe(false);
});
