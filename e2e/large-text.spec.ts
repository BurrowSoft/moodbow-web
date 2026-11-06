import { expect, test } from "@playwright/test";

// The browser's own text setting on a 320 px phone, on the pages someone with large
// text needs first. Sign in's button scrolled /sign-in sideways by up to 194 px (Web
// Tester, #203), and fr and de already at 200 %. Soft: one run lists every page and
// language, naming what sticks out.
const PAGES = ["/", "/welcome", "/consent", "/sign-up", "/sign-in", "/forgot-password"];
const LANGUAGES = ["", "/fr", "/es", "/pt-br", "/de", "/it", "/th"];

test("large text, set in the browser: the sign-in pages stay inside a 320 px phone in every language", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(240_000);
  const cdp = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const percent of [200, 300]) {
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
    for (const language of LANGUAGES) {
      for (const path of PAGES) {
        const route = `${language}${path === "/" && language ? "" : path}`;
        await page.goto(route);
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        // The setting really is on, or all of this would pass at the normal size.
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), `${route} at ${percent}%`).toBe(`${(16 * percent) / 100}px`);
        const sticksOut = await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5 && e.getBoundingClientRect().width > 1 && !e.classList.contains("sr-only"))
            .slice(0, 4)
            .map((e) => `${e.tagName.toLowerCase()} ${Math.round(e.getBoundingClientRect().right)}`),
        );
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect.soft({ route, percent, overflow, sticksOut }).toEqual({ route, percent, overflow: 0, sticksOut: [] });
      }
    }
  }
});

test("large text at 200 %: Consent's heading keeps its words whole on a 320 px phone", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  const cdp = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
  for (const language of LANGUAGES.filter((l) => l !== "/th")) {
    await page.goto(`${language}/consent`);
    const widest = await page.getByRole("heading", { level: 1 }).evaluate((h) => {
      const ruler = document.createElement("canvas").getContext("2d")!;
      ruler.font = getComputedStyle(h).font;
      const words = (h.textContent ?? "").split(" ").map((word) => ruler.measureText(word).width);
      return { widest: Math.max(...words), room: h.clientWidth };
    });
    expect.soft(widest.widest, `${language || "/en"}`).toBeLessThanOrEqual(widest.room);
  }
});

test("a legal table's words aren't split at the normal size", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/privacy");
  const cell = page.locator(".legal-prose td").first();
  await expect(cell).toHaveCSS("overflow-wrap", "break-word");
});
