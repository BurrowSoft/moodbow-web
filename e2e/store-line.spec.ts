import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { axeAtWidths } from "./axe";

// Welcome's store line (decision 185), axe at 320 and 1280 px in en and pt-BR. Its condition
// (play-live) is off in every build until Vitor's release is live, so the line is put on the real
// /welcome page here with the page's exact classes and words, and checked as the page draws it:
// contrast, the link's name, nothing serious or critical. The unit test (welcome.stores.test.tsx)
// checks that the page renders this markup once the condition is met.
const messages = (locale: string) => JSON.parse(readFileSync(join(process.cwd(), "src", "messages", `${locale}.json`), "utf8")) as { home: Record<string, string> };

// Only once React has hydrated the column (issue #381): a node put into the server's HTML before
// hydration finishes is one React doesn't expect there, so it removes it, and the line was "not
// found" now and then (#364, #373, #379, #385). The column carries React's fiber key once it's
// hydrated, and the slides' button its props once their Suspense boundary is (the same check as
// journey.spec's #284 fix). After that nothing re-renders the column's children.
async function hydrated(page: Page) {
  // Functions passed to evaluate run in the page, so each takes its prefix as an argument.
  const hasKey = (el: Element, prefix: string) => Object.keys(el).some((key) => key.startsWith(prefix));
  await expect.poll(() => page.getByTestId("welcome-column").evaluate(hasKey, "__reactFiber"), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => page.locator("[data-testid=welcome-next], [data-testid=welcome-start]").first().evaluate(hasKey, "__reactProps"), { timeout: 15_000 }).toBe(true);
}

for (const [route, locale] of [["", "en"], ["/pt-br", "pt-br"]] as const) {
  test(`axe: Welcome's Google Play line (${locale}), at 320 and 1280 px`, async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "axe once is enough");
    const h = messages(locale).home;
    await axeAtWidths(page, `Welcome store line (${locale})`, async () => {
      await page.goto(`${route}/welcome`);
      await hydrated(page);
      await page.evaluate(
        ({ getApp, play }) => {
          const line = document.createElement("p");
          line.className = "mt-10 text-center leading-[1.429] [font-size:min(0.875rem,max(8.75vw,28px))] text-muted";
          line.setAttribute("data-testid", "welcome-stores");
          line.append(`${getApp} `);
          const link = document.createElement("a");
          link.href = "https://play.google.com/store/apps/details?id=com.burrowsoft.moodbow";
          link.className = "font-medium text-accent underline underline-offset-4";
          link.textContent = play;
          line.append(link);
          // The content column, where the page draws it: by its test id, never by the
          // page's structure (#350's lifebuoy wrapper once broke a child selector here).
          document.querySelector('[data-testid="welcome-column"]')!.append(line);
        },
        { getApp: h.storeGetApp, play: h.storeGooglePlay },
      );
      await expect(page.getByTestId("welcome-stores")).toBeVisible();
    });
  });
}
