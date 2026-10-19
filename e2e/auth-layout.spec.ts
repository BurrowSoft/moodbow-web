import { expect, test, type Page } from "@playwright/test";

// The auth / status pages share /email-confirmed's centred layout (UX, from
// Vitor's /auth/confirm at 1900 px, which sat off-centre above the centred
// footer): the logo, heading and action are centred on the same axis as
// the footer, at every width, with no sideways scroll.
const PAGES = [
  "/auth/confirm?token_hash=a1b2c3d4e5f60718293a4b5c6d7e8f90&type=signup",
  "/auth/confirm?token_hash=x&type=nope",
  "/email-confirmed",
  "/auth/reset-password",
];

const centreX = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2;
  });

for (const width of [1900, 1280, 768, 320]) {
  test.describe(`${width} px`, () => {
    for (const path of PAGES) {
      test(path, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const footer = await centreX(page, "footer nav");
        for (const part of ["main img", "main h1"]) {
          expect(Math.abs((await centreX(page, part)) - footer), `${part} vs footer`).toBeLessThanOrEqual(2);
        }
        const action = page.locator("main button, main a[href]").first();
        if (await action.count()) expect(Math.abs((await centreX(page, "main button, main a[href]")) - footer), "action vs footer").toBeLessThanOrEqual(2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      });
    }
  });
}
