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

test("large text at 300 %: a page's heading is never smaller than the body under it", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  const cdp = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });
  // Consent's body and heading are both capped, so it compares with what's under the heading.
  await page.goto("/consent");
  const consent = await page.evaluate(() => ({ heading: parseFloat(getComputedStyle(document.querySelector("h1")!).fontSize), body: parseFloat(getComputedStyle(document.querySelector("form label span")!).fontSize) }));
  expect(consent.heading).toBeGreaterThanOrEqual(consent.body);
  // Everywhere else the body follows the setting, and the heading's 1rem floor keeps up with it.
  await page.goto("/sign-in");
  const signIn = await page.evaluate(() => ({ heading: parseFloat(getComputedStyle(document.querySelector("h1")!).fontSize), body: parseFloat(getComputedStyle(document.documentElement).fontSize) }));
  expect(signIn.heading).toBeGreaterThanOrEqual(signIn.body);
});

test("Consent's boxes keep the page's own size on a wide screen: the cap is only for narrow or large text", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "once is enough");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/consent");
  const sizes = await page.evaluate(() => ({ box: getComputedStyle(document.querySelector("form label span")!).fontSize, page: getComputedStyle(document.querySelector("form")!.parentElement!).fontSize }));
  expect(sizes.box).toBe(sizes.page);
  expect(sizes.box).toBe("17px");
});

// "J'a / cc / ep / te", and French's heading "commence / r" (Web Tester, on #233): this is the page
// people have to be able to read. Word by word: a line may end between words, and inside one only
// if the word alone is wider than its line, as German's "Datenschutzerklärung" is at 320 px.
test("large text: Consent's heading and boxes keep their words whole, on a 320 px phone and on a wide screen", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(180_000);
  const cdp = await page.context().newCDPSession(page);
  for (const [width, percent] of [[320, 100], [320, 200], [320, 300], [1280, 200], [1920, 300]]) {
    await page.setViewportSize({ width, height: 640 });
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
    for (const language of LANGUAGES.filter((l) => l !== "/th")) {
      await page.goto(`${language}/consent`);
      const split = await page.evaluate(() => {
        const out: string[] = [];
        const roots = [document.querySelector("h1"), document.querySelector("[data-testid=consent-notice]"), ...document.querySelectorAll("form label span"), document.querySelector("form button[type=submit]")];
        for (const root of roots) {
          if (!root) continue;
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
            for (const m of node.data.matchAll(/[^\s-]+/g)) {
              const range = document.createRange();
              range.setStart(node, m.index);
              range.setEnd(node, m.index + m[0].length);
              if (range.getClientRects().length < 2) continue;
              // The word on one line, laid out in the page's own font, against the room it has.
              const probe = document.createElement("span");
              probe.style.cssText = "position:absolute;white-space:nowrap";
              probe.textContent = m[0];
              root.append(probe);
              const wide = probe.getBoundingClientRect().width;
              probe.remove();
              if (wide <= root.getBoundingClientRect().width) out.push(m[0]);
            }
          }
        }
        return out;
      });
      expect.soft(split, `${language || "/en"} at ${width} px, ${percent} %`).toEqual([]);
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${language || "/en"} at ${width} px, ${percent} %`).toBe(0);
    }
  }
});

// #240: from the rem-based wide layout up, the words people agree to stayed at a fixed 17 px while
// Continue grew to 48 px. Every language, Thai too: this is about size, not where lines end.
test("large text on a wide screen: Consent's boxes grow with the browser's setting", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  for (const [width, percent] of [[1280, 150], [1280, 200], [1920, 200], [1920, 300], [2560, 300]]) {
    await page.setViewportSize({ width, height: 800 });
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: Math.round((13 * percent) / 100) } });
    for (const language of LANGUAGES) {
      await page.goto(`${language}/consent`);
      const box = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("form label span")!).fontSize));
      expect.soft(box, `${language || "/en"} at ${width} px, ${percent} %`).toBeCloseTo((17 * percent) / 100, 1);
    }
  }
});

// The legal pages and Help share this. 48 px on a 320 px phone split ordinary words (Web Tester's
// numbers, 7 Nov): at 32 px only a word wider than its line may, like an email address.
test("large text: a legal page's words stay whole on a 320 px phone, and normal size stays as it was", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const percent of [100, 200, 300]) {
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
    for (const route of ["/privacy", "/terms", "/es/privacy", "/es/terms", "/fr/privacy", "/pt-br/privacy"]) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      const measured = await page.evaluate(() => {
        const out: string[] = [];
        const roots = [document.querySelector("h1"), document.querySelector("[data-testid=page-notice]"), ...document.querySelectorAll(".legal-prose :is(p, li, h2, h3)")];
        for (const root of roots) {
          if (!root) continue;
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
            for (const m of node.data.matchAll(/[^\s-]+/g)) {
              const range = document.createRange();
              range.setStart(node, m.index);
              range.setEnd(node, m.index + m[0].length);
              if (range.getClientRects().length < 2) continue;
              const probe = document.createElement("span");
              probe.style.cssText = "position:absolute;white-space:nowrap";
              probe.textContent = m[0];
              root.append(probe);
              const wide = probe.getBoundingClientRect().width;
              probe.remove();
              if (wide <= root.getBoundingClientRect().width) out.push(m[0]);
            }
          }
        }
        const size = (css: string) => getComputedStyle(document.querySelector(css)!).fontSize;
        return { split: out, body: size(".legal-prose p"), section: size(".legal-prose h2"), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      expect.soft(measured.split, `${route} at ${percent} %`).toEqual([]);
      expect.soft(measured.overflow, `${route} at ${percent} %`).toBe(0);
      if (percent === 100) expect.soft([measured.body, measured.section], route).toEqual(["16px", "20px"]);
      if (percent !== 100) expect.soft(measured.body, route).toBe("32px");
    }
    // The "available in English" line above the article, and the way into Help.
    await page.goto("/fr/privacy");
    expect.soft(await page.evaluate(() => getComputedStyle(document.querySelector("[data-testid=page-notice]")!).fontSize)).toBe(percent === 100 ? "14px" : "28px");
    await page.goto("/help");
    const help = await page.evaluate(() => ({ intro: getComputedStyle(document.querySelector("article h1 + div p")!).fontSize, topic: getComputedStyle(document.querySelector("article section h2")!).fontSize, summary: getComputedStyle(document.querySelector("article section li p")!).fontSize, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    expect.soft(help).toEqual(percent === 100 ? { intro: "16px", topic: "18px", summary: "14px", overflow: 0 } : { intro: "32px", topic: "35.2px", summary: "28px", overflow: 0 });
    for (const route of ["/support", "/account-deletion"]) {
      await page.goto(route);
      expect.soft(await page.evaluate(() => getComputedStyle(document.querySelector("article h1 + div p")!).fontSize), `${route} at ${percent} %`).toBe(percent === 100 ? "16px" : "32px");
    }
  }
  // From the wide layout up, at normal size, as #241 left it.
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 16, fixed: 13 } });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/privacy");
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".legal-prose p")!).fontSize)).toBe("17px");
});

// Type stops growing at about 200 % on narrow screens, so pinch zoom has to cover anyone who needs more.
test("the viewport never stops someone zooming", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "once is enough");
  for (const route of ["/", "/consent", "/privacy", "/terms", "/help", "/sign-in"]) {
    await page.goto(route);
    const viewport = await page.locator("meta[name=viewport]").getAttribute("content");
    expect(viewport, route).toBeTruthy();
    expect(viewport, route).not.toMatch(/maximum-scale|user-scalable/i);
  }
});

// #242: px sizes that ignored the setting. The same at normal size; home stops growing at about 200 %
// on narrow screens (decision 231), and elsewhere a heading keeps up with the body under it.
test("home and the plain pages' headings follow the browser's setting", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  const setting = (percent: number) => cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: Math.round((13 * percent) / 100) } });
  const size = (css: string) => page.evaluate((c) => getComputedStyle(document.querySelector(c)!).fontSize, css);
  const home = [
    { width: 320, percent: 100, heading: "30px", sub: "16px", feature: "15px" },
    { width: 320, percent: 200, heading: "38.4px", sub: "32px", feature: "30px" },
    { width: 320, percent: 300, heading: "38.4px", sub: "32px", feature: "30px" },
    { width: 1280, percent: 100, heading: "44px", sub: "18px", feature: "15px" },
    { width: 1280, percent: 200, heading: "88px", sub: "36px", feature: "30px" },
  ];
  for (const { width, percent, heading, sub, feature } of home) {
    await page.setViewportSize({ width, height: 800 });
    await setting(percent);
    for (const language of ["/", "/fr", "/es", "/pt-br"]) {
      await page.goto(language);
      const at = `${language} at ${width} px, ${percent} %`;
      expect.soft(await size("h1"), at).toBe(heading);
      expect.soft(await size("h1 + p"), at).toBe(sub);
      expect.soft(await size("[data-testid^=home-feature-] p"), at).toBe(feature);
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), at).toBe(0);
    }
  }
  await page.setViewportSize({ width: 320, height: 640 });
  for (const [route, normal, large, body] of [["/welcome", "28px", "36px", "[data-testid=welcome-slide-1] p:not(.sr-only)"], ["/no-such-page", "30px", "38.4px", "main article p"]]) {
    await setting(100);
    await page.goto(route);
    expect.soft(await size("h1"), route).toBe(normal);
    expect.soft(await size(body), route).toBe("16px");
    await setting(300);
    await page.goto(route);
    expect.soft(await size("h1"), `${route} at 300 %`).toBe(large);
    expect.soft(await size(body), `${route} at 300 %`).toBe("32px");
  }
  expect.soft(await page.goto("/welcome").then(() => size("[data-testid=welcome-next]")), "Next at 300 %").toBe("32px");
});

// #246: the help in the card stops growing at about 200 % on narrow screens, like the page behind it
// (decision 231); its title and intro stay smaller, so help starts on the first screen (journeys pin
// that, and a known country's numbers).
test("large text: the help card keeps up, and its number and Close stay whole", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const percent of [100, 200, 300]) {
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
    for (const language of ["", "/fr", "/es", "/pt-br"]) {
      const at = `${language || "/en"} at ${percent} %`;
      await page.goto(`${language}/sign-in`);
      await page.getByTestId("sign-in-get-help").click();
      const card = page.getByTestId("safety-card");
      await expect(card, at).toBeVisible();
      const measured = await card.evaluate((el) => {
        const size = (e: Element | null) => getComputedStyle(e!).fontSize;
        const number = [...el.querySelectorAll("a[href^='tel:']")].flatMap((a) => [...a.textContent!.matchAll(/[0-9][0-9 ()+-]*[0-9]/g)].map((m) => ({ a, m })));
        const split = number.filter(({ a, m }) => {
          const text = a.firstChild as Text;
          const range = document.createRange();
          range.setStart(text, m.index);
          range.setEnd(text, m.index + m[0].length);
          return range.getClientRects().length > 1;
        }).map(({ m }) => m[0]);
        return { intro: size(el), title: size(el.querySelector("h2")), close: size(el.querySelector("[data-testid=safety-close]")), small: size(el.querySelector("[data-testid=safety-find-helpline]")), split, sideways: el.scrollWidth - el.clientWidth };
      });
      expect.soft(measured, at).toEqual(percent === 100 ? { intro: "16px", title: "18px", close: "16px", small: "14px", split: [], sideways: 0 } : { intro: "25.6px", title: "25.6px", close: "32px", small: "28px", split: [], sideways: 0 });
      // In px: in rem the corner cut off the title's first letter (Web Tester, #256).
      await expect.soft(card, at).toHaveCSS("border-top-left-radius", "24px");
      const close = page.getByTestId("safety-close");
      await close.scrollIntoViewIfNeeded();
      await expect(close, at).toBeInViewport();
      await close.click();
      await expect(card, at).toHaveCount(0);
    }
  }
});
