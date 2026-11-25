import { expect, test, type Page } from "@playwright/test";
import countries from "../content/contracts/countries.json";
import de from "../src/messages/de.json";
import en from "../src/messages/en.json";
import es from "../src/messages/es.json";
import fr from "../src/messages/fr.json";
import it from "../src/messages/it.json";
import pt from "../src/messages/pt-br.json";
import th from "../src/messages/th.json";
import { dialogButton } from "../src/lib/ui/dialogButton";
import { BO_HEADING, DAY_ADD_ENTRY, LABEL_TRACKING, LOCKED_ROW_LABEL, ME_LOCKED_ROW, OFFER_STRIP_LIGHTS, PLUS_CARD, PLUS_CARD_OFFER_TAG, PLUS_CARD_PLUS_TAG, PLUS_CARD_SMALL, PLUS_CARD_TAG, PLUS_CARD_TAG_ROW, PLUS_CARD_TITLE, WEEK_DAY, WEEK_DAY_LABEL, WEEK_DAYS, WEEK_HEADING, WEEK_SUMMARY, YEAR_MONTH, YEAR_MONTH_LABEL, YEAR_STRIP, YEAR_STRIP_BOX } from "../src/lib/ui/largeText";

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

test("large text at 200 %: Create account's heading keeps its words whole on a 320 px phone", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  const cdp = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
  for (const language of LANGUAGES.filter((l) => l !== "/th")) {
    await page.goto(`${language}/sign-up`);
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
  // The consent boxes (on Create account since 1.3 §6) are capped, so it compares with them.
  await page.goto("/sign-up");
  const consent = await page.evaluate(() => ({ heading: parseFloat(getComputedStyle(document.querySelector("h1")!).fontSize), body: parseFloat(getComputedStyle(document.querySelector("form label span")!).fontSize) }));
  expect(consent.heading).toBeGreaterThanOrEqual(consent.body);
  // Everywhere else the body follows the setting, and the heading's 1rem floor keeps up with it.
  await page.goto("/sign-in");
  const signIn = await page.evaluate(() => ({ heading: parseFloat(getComputedStyle(document.querySelector("h1")!).fontSize), body: parseFloat(getComputedStyle(document.documentElement).fontSize) }));
  expect(signIn.heading).toBeGreaterThanOrEqual(signIn.body);
});

test("Create account's consent boxes keep the page's own size on a wide screen: the cap is only for narrow or large text", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "once is enough");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/sign-up");
  const sizes = await page.evaluate(() => ({ box: getComputedStyle(document.querySelector("form label span")!).fontSize, page: getComputedStyle(document.querySelector("form")!.parentElement!).fontSize }));
  expect(sizes.box).toBe(sizes.page);
  expect(sizes.box).toBe("17px");
});

// "J'a / cc / ep / te", and French's heading "commence / r" (Web Tester, on #233): this is the page
// people have to be able to read. Word by word: a line may end between words, and inside one only
// if the word alone is wider than its line, as German's "Datenschutzerklärung" is at 320 px.
// Product and company names never split (UX, 19 Nov; the Web Tester's "Mood- / bow" on #379): on
// Create account at 300 % on a 320 px phone, where its text hyphenates, every name in the list is
// wrapped, never hyphenates, and no word of it runs onto a second line. Consent shares the wrapping
// (ConsentForm, its notice) and needs a signed-in account, so its unit tests cover it.
test("large text: Create account's product and company names stay whole at 300 % on a 320 px phone", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(120_000);
  const NAMES = ["Vitor Carvalho", "BurrowSoft", "Moodbow", "Anthropic", "Stripe", "Google Play", "App Store", "Supabase", "JavaScript", "Bluetooth", "TelefonSeelsorge"];
  const cdp = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });
  for (const language of LANGUAGES.filter((l) => l !== "/th")) {
    await page.goto(`${language}/sign-up`);
    await page.evaluate(() => document.fonts.ready);
    const found = await page.evaluate((names) => {
      const scope = [...document.querySelectorAll("[data-hyphenate]")];
      const text = scope.map((el) => el.textContent ?? "").join(" ");
      const wrapped = [...document.querySelectorAll("[data-hyphenate] .whole-name")];
      const count = (s: string, n: string) => s.split(n).length - 1;
      const split: string[] = [];
      for (const el of wrapped) {
        if (getComputedStyle(el).hyphens !== "manual") split.push(`${el.textContent}: hyphens ${getComputedStyle(el).hyphens}`);
        // Word by word: a two-word name may wrap between its words, never inside one.
        const node = el.firstChild as Text | null;
        if (!node) continue;
        let at = 0;
        for (const word of node.data.split(" ")) {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + word.length);
          if (range.getClientRects().length > 1) split.push(`${word} split across lines`);
          at += word.length + 1;
        }
      }
      return {
        unwrapped: names.filter((n) => count(text, n) !== wrapped.filter((el) => el.textContent === n).length),
        split,
      };
    }, NAMES);
    expect.soft(found.unwrapped, `${language || "/en"}: every name wrapped`).toEqual([]);
    expect.soft(found.split, `${language || "/en"}: no name split`).toEqual([]);
  }
});

test("large text: Create account's heading and consent boxes keep their words whole, on a 320 px phone and on a wide screen", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(180_000);
  const cdp = await page.context().newCDPSession(page);
  for (const [width, percent] of [[320, 100], [320, 200], [320, 300], [1280, 200], [1920, 300]]) {
    await page.setViewportSize({ width, height: 640 });
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
    for (const language of LANGUAGES.filter((l) => l !== "/th")) {
      await page.goto(`${language}/sign-up`);
      const split = await page.evaluate(() => {
        const out: string[] = [];
        // The summary list and "Started in the app?" too (UX, 19 Nov: "Stimmu / ng" at 300 %).
        const roots = [document.querySelector("h1"), document.querySelector("[data-testid=consent-notice]"), ...document.querySelectorAll("form label span"), document.querySelector("form button[type=submit]"), ...document.querySelectorAll("[data-testid=signup-summary] li"), document.querySelector("[data-testid=auth-started-in-app]")];
        for (const root of roots) {
          if (!root) continue;
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
            // Whole, or split with a hyphen at really large text (UX, 19 Nov: the journal's rule, only
            // under 9em wide). The browser draws the hyphen, so a split counts as one where it hyphenates.
            if (getComputedStyle(node.parentElement!).hyphens === "auto") continue;
            for (const m of node.data.matchAll(/[^\s\-–]+/g)) {
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
test("large text on a wide screen: Create account's consent boxes grow with the browser's setting", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  for (const [width, percent] of [[1280, 150], [1280, 200], [1920, 200], [1920, 300], [2560, 300]]) {
    await page.setViewportSize({ width, height: 800 });
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: Math.round((13 * percent) / 100) } });
    for (const language of LANGUAGES) {
      await page.goto(`${language}/sign-up`);
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
            // Whole, or split with a hyphen at really large text (UX, 19 Nov), as on Create account.
            if (getComputedStyle(node.parentElement!).hyphens === "auto") continue;
            for (const m of node.data.matchAll(/[^\s\-–]+/g)) {
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
        return { split: out, body: size(".legal-prose p"), section: size(".legal-prose h2"), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, hyphens: getComputedStyle(document.querySelector(".legal-prose p")!).hyphens };
      });
      // Decision 231 at normal size: whole words, no hyphens. At 200 % and 300 % a 320 px phone is a
      // 13em column or narrower, where the legal pages hyphenate long words in every language (UX,
      // 20 Nov, after /es/terms cut "Responsabilid / ad" at 200 %).
      expect.soft(measured.hyphens, `${route} at ${percent} %`).toBe(percent === 100 ? "manual" : "auto");
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

// The help button's words stay whole, signed out (the journey has Me's): browser hyphens split "par-ler"
// with room to spare (Web Tester). It's the way to help.
test("large text: the help button's words stay whole on a phone", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 640 });
    for (const language of ["", "/fr", "/es", "/pt-br"]) {
      await page.goto(`${language}/sign-in`);
      const split = await page.getByTestId("sign-in-get-help").evaluate((el) => {
        const text = el.firstChild as Text;
        return [...text.data.matchAll(/\S+/g)].filter((word) => {
          const range = document.createRange();
          range.setStart(text, word.index);
          range.setEnd(text, word.index + word[0].length);
          return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1;
        }).map((word) => word[0]);
      });
      expect.soft(split, `${language || "/en"} at ${width} px`).toEqual([]);
    }
  }
});

// #250: the help page's numbers stay whole, as on the card (the journey pins those): someone has to dial them.
test("large text: every number on the help page stays whole on a phone", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(240_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });
  await page.setViewportSize({ width: 320, height: 640 });
  for (const { code, helpline, emergency } of countries.countries) {
    for (const language of ["", "/fr", "/es", "/pt-br"]) {
      await page.goto(`${language}/help/get-help-now?country=${code}`);
      for (const [id, display] of [["help-now-call-helpline", helpline?.display], ["help-now-call-emergency", emergency?.display]]) {
        if (!display) continue;
        const lines = await page.getByTestId(id!).evaluate((el, plain) => {
          const number = el.querySelector("[data-help-number]");
          if (number?.textContent !== plain) return -1;
          const before = number.previousSibling as Text | null;
          const after = number.nextSibling as Text | null;
          const range = document.createRange();
          if (before?.data.endsWith("(")) range.setStart(before, before.data.length - 1);
          else range.setStartBefore(number);
          if (after?.data.startsWith(")")) range.setEnd(after, 1);
          else range.setEndAfter(number);
          return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
        }, display);
        expect.soft(lines, `${code} ${id} ${language || "/en"}`).toBe(1);
      }
      // The first number is whole on the first screen (UX).
      const first = (await page.getByTestId(helpline ? "help-now-call-helpline" : "help-now-call-emergency").evaluate((el) => el.getBoundingClientRect().bottom));
      expect.soft(first, `${code} ${language || "/en"}: the first number's bottom edge`).toBeLessThanOrEqual(640);
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${code} ${language || "/en"}`).toBe(0);
    }
  }
});

// <html lang> is the page's language on every locale: the browser hyphenates in it (the Web
// Tester's long-language pass, UX 12 Nov), and screen readers read in it.
test("<html lang> is the page's language in every locale", async ({ page }) => {
  for (const language of LANGUAGES) {
    await page.goto(`${language}/sign-up`);
    const lang = await page.evaluate(() => document.documentElement.lang.toLowerCase());
    expect.soft(lang, language || "/en").toBe(language ? language.slice(1) : "en");
  }
});

// One rule on every page (UX, 20 Nov: the journal, the public and legal pages, Consent and
// sign-up): only words of 8 letters or more hyphenate (HYPHEN_MIN), 3 on each side, so a long
// word breaks with a hyphen at large text instead of mid-word with none. Only from a 13em column
// (UX, 20 Nov: 200 % on phones up to ~416 px; it was 10em, and 360 px at 200 %, 11.25em, cut
// "Datenschutzerkl / ärung" bare): wider than that words stay whole (decision 231), since a browser
// hyphenates at a line's end even when the word would fit on the next line. At 100 % no phone is
// 13em wide. The journal needs a session, so its markup is put on a public page here; the Web
// Tester's pass reads the real pages.
test("every page hyphenates long words from a 13em column (200 % and 300 % on a phone up to ~416 px), never at 100 %", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  const cdp = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 640 });
  const styles = async () =>
    page.evaluate(() => {
      const journal = document.createElement("div");
      journal.setAttribute("data-journal", "");
      journal.innerHTML = "<h2>Environnement</h2><label>Crépuscule</label><button>Rappel quotidien</button>";
      document.querySelector("main")!.prepend(journal);
      const read = (el: Element | null) => {
        if (!el) return "missing";
        const s = getComputedStyle(el) as CSSStyleDeclaration & { hyphenateLimitChars?: string };
        return `${s.hyphens}${s.hyphens === "auto" ? ` ${s.hyphenateLimitChars}` : ""}`;
      };
      return { journal: ["h2", "label", "button"].map((tag) => `${tag} ${read(journal.querySelector(tag))}`), consentHeading: read(document.querySelector("main h1")) };
    });
  for (const [percent, expected] of [
    [100, "manual"],
    [200, "auto 8 3 3"],
    [300, "auto 8 3 3"],
  ] as const) {
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
    await page.goto("/fr/consent");
    const got = await styles();
    expect(got.journal, `${percent} %`).toEqual(["h2", "label", "button"].map((tag) => `${tag} ${expected}`));
    // One rule everywhere (UX, 20 Nov): the public pages too.
    expect(got.consentHeading, `Consent's heading at ${percent} %`).toBe(expected);
  }
  // The line itself: 390 px at 200 % (12.2em) hyphenates; 412 px at 100 % (25.75em), the widest phone at normal size,
  // never does.
  for (const [width, percent, expected] of [
    [390, 200, "auto 8 3 3"],
    [412, 100, "manual"],
  ] as const) {
    await page.setViewportSize({ width, height: 640 });
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
    await page.goto("/fr/consent");
    const got = await styles();
    expect(got.journal, `${width} px at ${percent} %`).toEqual(["h2", "label", "button"].map((tag) => `${tag} ${expected}`));
    expect(got.consentHeading, `Consent's heading, ${width} px at ${percent} %`).toBe(expected);
  }
});

// A call link in a row, as the safety plan, the help card and the help page lay them out: at
// 300 % on a 320 px phone a long helpline name ("TelefonSeelsorge", de) pushed the page 9 px
// sideways, because a flex item can't be narrower than its longest word unless it may break
// anywhere. The link here is put on a real page, laid out the same way.
test("large text at 300 %: a call link with a long name stays inside a 320 px phone", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  const cdp = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });
  await page.goto("/de/consent");
  const result = await page.evaluate(() => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;align-items:center";
    const call = document.createElement("a");
    call.href = "tel:08001110111";
    call.style.cssText = "display:inline-flex;min-height:44px;align-items:center;font-weight:500";
    call.textContent = "TelefonSeelsorge 0800 111 0 111";
    row.append(call);
    document.querySelector("main")!.prepend(row);
    const right = call.getBoundingClientRect().right;
    // Inside a heading too, which hyphenates: the call link still never takes a hyphen.
    const heading = document.createElement("h2");
    const inHeading = call.cloneNode(true) as HTMLAnchorElement;
    heading.append(inHeading);
    document.querySelector("main")!.prepend(heading);
    return {
      right: Math.round(right),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      wrap: getComputedStyle(call).overflowWrap,
      hyphens: [getComputedStyle(call).hyphens, getComputedStyle(inHeading).hyphens],
    };
  });
  expect(result.wrap).toBe("anywhere");
  expect(result.hyphens).toEqual(["manual", "manual"]);
  expect(result.overflow).toBe(0);
  expect(result.right).toBeLessThanOrEqual(320);
});

// The number itself (UX, 12 Nov): "TelefonSeelsorge anrufen (0800 111 0 111)" at 300 % on a 320 px
// phone, as the safety plan lays it out (an inline link in a padded box), with HelpNumberText's
// markup: the bracketed number is one block that wraps only between its digit groups. It stays
// inside 320 px, no group splits, and "(" and ")" stay with the number.
test("large text at 300 %: a help number wider than the line wraps between its digit groups, never inside one", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  const cdp = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });
  await page.goto("/de/consent");
  const result = await page.evaluate(() => {
    const box = document.createElement("div");
    box.style.cssText = "margin-top:12px;border-radius:16px;padding:12px";
    box.innerHTML =
      '<a href="tel:08001110111" style="font-weight:500;text-decoration:underline">TelefonSeelsorge anrufen ' +
      '<span class="inline-block max-w-full [text-decoration:inherit]">(<span data-help-number="">' +
      '<span class="whitespace-nowrap">0800</span> <span class="whitespace-nowrap">111</span> <span class="whitespace-nowrap">0</span> <span class="whitespace-nowrap">111</span>' +
      "</span>)</span></a>";
    document.querySelector("main")!.prepend(box);
    const lines = (el: Element) => new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size;
    const groups = [...box.querySelectorAll("[data-help-number] > span")];
    const block = box.querySelector("[data-help-number]")!.parentElement!;
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      right: Math.round(Math.max(...[...box.querySelectorAll("a, a *")].map((e) => e.getBoundingClientRect().right))),
      groupLines: groups.map(lines),
      groupsOnOneLine: new Set(groups.map((g) => Math.round(g.getBoundingClientRect().top))).size === 1,
      bracketsWithNumber: block.firstChild?.textContent === "(" && block.lastChild?.textContent === ")",
    };
  });
  console.log(`0800 111 0 111 at 300 %: ${JSON.stringify(result)}`);
  expect(result.overflow).toBe(0);
  expect(result.right).toBeLessThanOrEqual(320);
  expect(result.groupLines).toEqual([1, 1, 1, 1]);
  expect(result.bracketsWithNumber).toBe(true);
});

// UX, 20 Nov (option A, the Web Tester's fr/pt-BR sweep at 320 px / 300 %: "Ajo / uter / une / not / e",
// "donnée / s", "d'icône / s", "novembr / e", "montren / t", "Mood / bow", "support@mood / bow.com"): no word cut
// without a hyphen. And the bar, verbatim: "UX (20 Nov night): with 8 3 3, Chromium may leave 2 letters after a
// hyphen (engine behaviour, 4-before/2-after); accepted. The test fails on any break WITHOUT a hyphen, and on any
// break leaving fewer than 2 letters on either side." (Measured on Chromium 153: at 8 3 3 it breaks "supprim-er",
// "Novemb-er", never with fewer than 4 before.)
// A break with a hyphen or without: laid out again with hyphenation off (hyphens: manual), a word that fits a line goes
// whole to the next one, so its break was a hyphen. A word that can't fit a line stays broken: where its break falls at
// the same place, the browser only ran out of room there (a cut); a hyphen falls earlier, since the hyphen needs room
// too. A soft hyphen (U+00AD) right before a break is a hyphen too.
async function cutWords(page: Page, roots: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const letters = (s: string) => s.replace(/[^\p{L}]/gu, "").length;
    const words: { node: Text; start: number; word: string }[] = [];
    for (const root of document.querySelectorAll(selector)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        const parent = node.parentElement;
        if (!parent || parent.closest(".sr-only") || getComputedStyle(parent).display === "none") continue;
        // A hyphen, a dash or a slash is a place a line may end anyway.
        for (const m of node.data.matchAll(/[^\s \-–—/]+/g)) words.push({ node, start: m.index, word: m[0] });
      }
    }
    // Where each word's characters change line, as offsets into the word.
    const breaks = ({ node, start, word }: { node: Text; start: number; word: string }) => {
      const tops = [...word].map((_, c) => {
        const range = document.createRange();
        range.setStart(node, start + c);
        range.setEnd(node, start + c + 1);
        return Math.round(range.getBoundingClientRect().top);
      });
      return tops.flatMap((top, c) => (c > 0 && top !== tops[c - 1] ? [c] : []));
    };
    const asShown = words.map(breaks);
    const off = document.createElement("style");
    off.textContent = "* { hyphens: manual !important; }";
    document.head.append(off);
    const unhyphenated = words.map(breaks);
    off.remove();
    const out: string[] = [];
    words.forEach(({ node, start, word }, i) => {
      for (const c of asShown[i]) {
        const before = letters(word.slice(0, c)), after = letters(word) - before;
        // A soft hyphen the line broke at is drawn (a hyphen, non-zero width; an unused one is zero wide). Chromium puts
        // the rect of the letter after it on the earlier line, so its break reads one letter later (#422: the browser
        // drew "WEIHNACHTS- / ANGEBOT", the rects said "…NACHTS·A / NGEBOT"); WebKit's rects are exact. So a break
        // right after a drawn soft hyphen, or one letter after it, is that soft hyphen's.
        const drawnShy = (k: number) => {
          if (k < 0 || word[k] !== String.fromCharCode(0xad)) return false;
          const range = document.createRange();
          range.setStart(node, start + k);
          range.setEnd(node, start + k + 1);
          return range.getBoundingClientRect().width > 0;
        };
        const softHyphen = drawnShy(c - 1) || drawnShy(c - 2);
        const hyphen = softHyphen || unhyphenated[i].length === 0 || !unhyphenated[i].includes(c);
        if (!hyphen) out.push(`${word.slice(0, c)} / ${word.slice(c)} (no hyphen)`);
        else if (before < 2 || after < 2) out.push(`${word.slice(0, c)} / ${word.slice(c)} (under 2 letters)`);
      }
    });
    return out;
  }, roots);
}
// Pages a session opens: the same classes on a public page in that language (the app's stylesheet, <html lang>).
async function mountIn(page: Page, language: string, width: number, html: string) {
  await page.goto(language);
  await page.evaluate(([w, inner]) => (document.body.innerHTML = `<div id="probe" style="width:${w}px">${inner}</div>`), [String(width), html] as const);
}

test("large text at 320 px / 300 %: no word in the fixed components is cut without a hyphen, in French and Portuguese", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(180_000);
  const cdp = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });
  // Each component at the width it has on its page (the app's 16 px gutters; a Me card's 16 px padding; Share's 18 px).
  for (const [language, m] of [["/fr", fr], ["/pt-br", pt]] as const) {
    const days = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 10, 16 + i)));
    const short = new Intl.DateTimeFormat(language.slice(1), { weekday: "short", timeZone: "UTC" });
    const narrow = new Intl.DateTimeFormat(language.slice(1), { weekday: "narrow", timeZone: "UTC" });
    const week = `<div class="${WEEK_SUMMARY}"><h2 class="${WEEK_HEADING}">${m.shareView.weekOf.replace("{date}", new Intl.DateTimeFormat(language.slice(1), { day: "numeric", month: "long", timeZone: "UTC" }).format(days[0]))}</h2><ol class="${WEEK_DAYS}">${days
      .map((d) => `<li class="${WEEK_DAY}"><span aria-hidden="true" data-day-label class="${WEEK_DAY_LABEL}"><span data-day-form="short">${short.format(d)}</span><span data-day-form="narrow">${narrow.format(d)}</span></span><span class="block h-[32px] w-full rounded-lg border border-dashed"></span></li>`)
      .join("")}</ol></div>`;
    const mounted: [string, number, string][] = [
      ["the day page's Add a note", 288, `<a href="#" class="${DAY_ADD_ENTRY}">${m.timeline.dayAddEntry}</a>`],
      ["Me's export button", 256, `<button type="button" class="${dialogButton()}">${m.me.meExport}</button>`],
      ["Me → Appearance's locked row", 256, `<a href="#" class="${ME_LOCKED_ROW}"><span class="${LOCKED_ROW_LABEL}">${m.plus.rowThemes}</span><svg width="16" height="16" aria-hidden="true"></svg></a>`],
      ["Share's week", 252, week],
      ["Bo's heading", 288, `<header class="flex flex-wrap items-center gap-x-[8px] gap-y-[4px]"><h1 class="${BO_HEADING}">${m.bo.screenLine.replace("Moodbow", '<span class="whole-name">Moodbow</span>')}</h1><a href="#" class="inline-flex min-h-11 items-center rounded-full border px-[16px]">Help</a></header>`],
    ];
    for (const [name, width, html] of mounted) {
      await mountIn(page, language, width, html);
      const where = `${language} ${name}`;
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), where).toBe("48px");
      expect.soft(await cutWords(page, "#probe"), where).toEqual([]);
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), where).toBe(0);
    }
    // Share's days: one letter each here (globals.css, [data-day-form]), side by side, none over the next.
    await mountIn(page, language, 252, week);
    const labels = await page.evaluate(() => [...document.querySelectorAll("[data-day-label]")].map((s) => [s.getBoundingClientRect().left, s.getBoundingClientRect().right, s.textContent, getComputedStyle(s.querySelector('[data-day-form="short"]')!).display]));
    expect.soft(labels.map((l) => l[3]), `${language} short forms hidden`).toEqual(Array(7).fill("none"));
    for (let i = 1; i < labels.length; i++) expect.soft(labels[i][0] as number, `${language} day ${i + 1} after day ${i}`).toBeGreaterThanOrEqual(labels[i - 1][1] as number);
    // Public pages, as they are.
    for (const [path, roots] of [["/sign-up", "[data-testid=signup-summary]"], ["/help", "article h1 + div p, article section h2"], ["/support", "article"], ["/account-deletion", "article"]] as const) {
      await page.goto(`${language}${path}`);
      // The rule is live under 13em: the 8-letter minimum holds, only Chromium's "after" part bends (the Reviewer).
      expect(await page.evaluate((sel) => getComputedStyle(document.querySelector(`${sel} p, ${sel} li`) ?? document.querySelector(sel)!).getPropertyValue("hyphenate-limit-chars"), roots.split(",")[0]), `${language}${path}: hyphenate-limit-chars`).toBe("8 3 3");
      expect.soft(await cutWords(page, roots), `${language}${path}`).toEqual([]);
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${language}${path}`).toBe(0);
      // The word people must type is never broken, not even with a hyphen (UX, 20 Nov: "SUPPRI- / MER").
      if (path === "/account-deletion") {
        const word = language === "/fr" ? "SUPPRIMER" : "APAGAR";
        const lines = await page.evaluate((w) => {
          const span = [...document.querySelectorAll("[data-testid=account-deletion-steps] span")].find((e) => e.textContent === w);
          return span ? new Set([...span.getClientRects()].map((r) => Math.round(r.top))).size : 0;
        }, word);
        expect.soft(lines, `${language}/account-deletion: ${word} on one line`).toBe(1);
      }
    }
  }
  // At the normal size the short day names are back.
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 16, fixed: 13 } });
  await mountIn(page, "/fr", 252, `<span data-day-form="short">lun.</span><span data-day-form="narrow">L</span>`);
  expect(await page.evaluate(() => [...document.querySelectorAll("[data-day-form]")].map((s) => getComputedStyle(s).display))).toEqual(["inline", "none"]);
});

// The Plus card and the uppercase labels at large text (UX, 23 Nov: fixed before 1 Dec, when the Christmas offer shows to
// everyone; its tag ran 75 px off a 320 px phone at 300 %). Each at the width it has on its page at 320 px: the app's
// 12 px gutters (296 px; the card's own 20 px padding inside), and the Plus screen's footer (the whole 320 px, 12 px each
// side, its text capped at 32 px) holding the strip. Every language the app shows.
test("large text at 320 px / 300 %: the Plus card, the uppercase labels and the Christmas strip stay inside, in every language", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(240_000);
  const cdp = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 48, fixed: 39 } });
  const lights = '<svg width="44" height="18" class="shrink-0" aria-hidden="true"></svg>';
  const arcs = '<svg width="22" height="22" class="shrink-0" aria-hidden="true"></svg>';
  for (const [language, m] of [["/", en], ["/fr", fr], ["/es", es], ["/pt-br", pt], ["/de", de], ["/it", it]] as const) {
    const p = m.plus;
    const card = (offer: boolean) =>
      `<section class="${PLUS_CARD} ${offer ? "bg-[#1E5B45] text-white" : "bg-pill"}"><div class="${PLUS_CARD_TAG_ROW}">${offer ? lights : arcs}<span class="${PLUS_CARD_TAG} ${offer ? PLUS_CARD_OFFER_TAG : PLUS_CARD_PLUS_TAG}">${offer ? p.offerLabel : p.label}</span></div>` +
      `<h2 class="${PLUS_CARD_TITLE}">${offer ? p.offerBannerTitle.replace("{offer}", "12,99 €") : p.bannerTitle}</h2><p>${offer ? p.offerBannerBody : p.bannerBody}</p>` +
      `<a href="#" class="${dialogButton(true)} w-full">${offer ? p.offerSee : p.tryFree}</a><p class="${PLUS_CARD_SMALL}">${(offer ? p.offerSmall : p.thenPrice).replace("{price}", "29,99 €")}</p></section>`;
    const month = new Intl.DateTimeFormat(language === "/" ? "en" : language.slice(1), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 8, 1)));
    const mounted: [string, number, string][] = [
      ["Me's Christmas card", 296, card(true)],
      ["Me's Plus card", 296, card(false)],
      ["Today's Plus tag", 296, `<section class="relative rounded-2xl bg-pill py-[12px] ps-[16px] pe-[52px]"><p class="text-xs font-medium ${LABEL_TRACKING} text-accent uppercase">${p.label}</p></section>`],
      ["Timeline's month", 296, `<h2 class="text-sm font-medium uppercase ${LABEL_TRACKING} text-muted">${month}</h2>`],
      [
        "the Plus screen's Christmas strip",
        320,
        `<div class="px-[12px] [font-size:min(1rem,max(10vw,32px))]"><div class="flex items-center gap-[12px] rounded-2xl px-[12px] py-[8px] text-left bg-[#1E5B45] text-white"><svg width="22" height="26" class="shrink-0" aria-hidden="true"></svg><span class="min-w-0 flex-1"><span class="block font-medium text-[#F3D27A]">${p.offerLabel}</span><span class="block text-[0.875em]">${p.offerStripBody}</span></span><span class="${OFFER_STRIP_LIGHTS}">${lights}</span></div></div>`,
      ],
    ];
    for (const [name, width, html] of mounted) {
      await mountIn(page, language, width, html);
      const where = `${language === "/" ? "/en" : language} ${name}`;
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), where).toBe("48px");
      expect.soft(await cutWords(page, "#probe"), where).toEqual([]);
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), where).toBe(0);
      // Nothing sticks out of its own width (a word past the card's edge shows even where the page can't scroll).
      const out = await page.evaluate(() => {
        const probe = document.getElementById("probe")!.getBoundingClientRect();
        return [...document.querySelectorAll("#probe *")].filter((e) => !e.closest("svg") && e.getBoundingClientRect().right > probe.right + 0.5).map((e) => `${e.tagName.toLowerCase()} +${Math.round(e.getBoundingClientRect().right - probe.right)}px`);
      });
      expect.soft(out, `${where}: inside its width`).toEqual([]);
    }
  }
  // At the normal size the tag keeps its size and wide spacing, and stays beside the lights (as before; at 300 % it went
  // under them above).
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 16, fixed: 13 } });
  await mountIn(page, "/", 296, card100());
  const tag = await page.evaluate(() => {
    const s = document.querySelector("#probe span")!, svg = document.querySelector("#probe svg")!, cs = getComputedStyle(s);
    return { size: cs.fontSize, spacing: cs.letterSpacing, beside: s.getBoundingClientRect().left > svg.getBoundingClientRect().right && s.getBoundingClientRect().top < svg.getBoundingClientRect().bottom };
  });
  expect(tag).toEqual({ size: "14px", spacing: "0.35px", beside: true });
  function card100() {
    return `<section class="${PLUS_CARD} bg-[#1E5B45] text-white"><div class="${PLUS_CARD_TAG_ROW}">${lights}<span class="${PLUS_CARD_TAG} ${PLUS_CARD_OFFER_TAG}">${en.plus.offerLabel}</span></div></section>`;
  }
});

// UX, 23 Nov (#422, after the Web Tester's de row): the offer's tag sits beside the lights only where it fits there on
// two lines, else on its own line under them, at every size and width. Me's card (the lights), Today's during the offer
// (the tree and the lights) and the free card's "Moodbow Plus" (the arcs), in every language, on phones 320–430 px wide
// at 100–300 %, with the app's stylesheet (its 13em rules live, the app's 12 px gutters under 360 px, else 16): beside
// means two lines at most, and nothing sticks out. A longer label one day fails here. At the normal size the tag stays
// beside the lights as on the board, except Today's on a 320 px phone (9em of room there; UX: under is fine); at 300 %
// on a 320 px phone the offer's goes under them (the Web Tester's row). Its words stay whole (UX, 23 Nov: no
// "OFFERTA SPE- / CIALE"): the offer's tag doesn't hyphenate, and cutWords finds no word cut at any step (de's breaks
// only at its soft hyphen; Thai's words have no spaces to tell them apart, so its line breaks are its own).
test("the Plus card's tag beside its icons only on two lines: every language, 320–430 px, 100–300 %", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(240_000);
  const cdp = await page.context().newCDPSession(page);
  const tree = '<svg width="22" height="26" class="shrink-0" aria-hidden="true"></svg>';
  const lights = '<svg width="44" height="18" class="shrink-0" aria-hidden="true"></svg>';
  const arcs = '<svg width="22" height="22" class="shrink-0" aria-hidden="true"></svg>';
  const card = (name: string, icons: string, kind: string, label: string) => `<section data-card="${name}" class="${PLUS_CARD}"><div class="${PLUS_CARD_TAG_ROW}">${icons}<span data-tag class="${PLUS_CARD_TAG} ${kind}">${label}</span></div></section>`;
  const wrong: string[] = [];
  const under100: string[] = [];
  const beside300: string[] = [];
  let italian300 = "";
  for (const [language, m] of [["/", en], ["/fr", fr], ["/es", es], ["/pt-br", pt], ["/de", de], ["/it", it], ["/th", th]] as const) {
    const cards = [card("me", lights, PLUS_CARD_OFFER_TAG, m.plus.offerLabel), card("today", tree + lights, PLUS_CARD_OFFER_TAG, m.plus.offerLabel), card("free", arcs, PLUS_CARD_PLUS_TAG, m.plus.label)].join("");
    await page.goto(language);
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 800 });
      for (const percent of [100, 112.5, 125, 137.5, 150, 162.5, 175, 200, 250, 300]) {
        const root = (16 * percent) / 100;
        await cdp.send("Page.setFontSizes", { fontSizes: { standard: root, fixed: Math.round((13 * percent) / 100) } });
        const at = `${language === "/" ? "/en" : language} ${width} px / ${percent} %`;
        const got = await page.evaluate(
          ([inner, html]) => {
            document.body.innerHTML = `<div style="width:${inner}px">${html}</div>`;
            return {
              root: getComputedStyle(document.documentElement).fontSize,
              large: matchMedia("(max-width: 13em)").matches,
              cards: [...document.querySelectorAll<HTMLElement>("[data-card]")].map((s) => {
                const tag = s.querySelector<HTMLElement>("[data-tag]")!, icons = [...s.querySelectorAll("svg")], t = tag.getBoundingClientRect();
                const icon = icons[icons.length - 1].getBoundingClientRect();
                const edge = s.getBoundingClientRect().right - parseFloat(getComputedStyle(s).paddingRight);
                // Its words line by line, each on the line its first letter is on (for Italian's reading below).
                const node = tag.firstChild as Text, rows = new Map<number, string[]>();
                for (const w of node.data.matchAll(/\S+/g)) {
                  const range = document.createRange();
                  range.setStart(node, w.index);
                  range.setEnd(node, w.index + 1);
                  const first = Math.round(range.getBoundingClientRect().top);
                  rows.set(first, [...(rows.get(first) ?? []), w[0]]);
                }
                return {
                  name: s.dataset.card!,
                  beside: t.top < icon.bottom && t.left >= icon.right - 0.5,
                  lines: Math.round(t.height / parseFloat(getComputedStyle(tag).lineHeight)),
                  outside: t.right > edge + 0.5 || tag.scrollWidth > tag.clientWidth + 0.5,
                  hyphens: getComputedStyle(tag).hyphens,
                  reading: [...rows.values()].map((r) => r.join(" ")).join(" / ").toUpperCase(),
                };
              }),
            };
          },
          [String(width - 2 * (width < 360 ? 12 : 16)), cards] as const,
        );
        // The browser is at the size asked for, and the 13em rules are live exactly where they should be.
        expect(got.root, at).toBe(`${root}px`);
        expect(got.large, `${at}: the 13em rules`).toBe(width < 13 * root);
        // No word cut: the 300 % test's own detector, at every step (a word wider than its line is cut by overflow-wrap;
        // de's may break only at its soft hyphen, where drawn). Thai has no spaces between its words: its breaks are its own.
        if (language !== "/th") for (const cut of await cutWords(page, "[data-tag]")) wrong.push(`${at}: ${cut}`);
        for (const c of got.cards) {
          if ((c.beside && c.lines > 2) || c.outside) wrong.push(`${at} ${c.name}: ${c.outside ? "outside its card" : `beside in ${c.lines} lines`}`);
          if (c.name !== "free" && c.hyphens !== "manual") wrong.push(`${at} ${c.name}: hyphens ${c.hyphens}`);
          if (percent === 100 && !c.beside) under100.push(`${at} ${c.name}`);
          if (percent === 300 && width === 320 && c.name !== "free" && c.beside) beside300.push(`${at} ${c.name}`);
          if (language === "/it" && percent === 300 && width === 320 && c.name === "me") italian300 = c.reading;
        }
      }
    }
  }
  expect(wrong, "beside its icons in more than two lines, or outside its card").toEqual([]);
  expect(under100, "under its icons at the normal size: only Today's on a 320 px phone").toEqual(
    ["/en", "/fr", "/es", "/pt-br", "/de", "/it", "/th"].map((l) => `${l} 320 px / 100 % today`),
  );
  expect(beside300, "the offer's tag beside the lights at 300 % on a 320 px phone").toEqual([]);
  // The widest language, under the lights at 300 % on a 320 px phone: three lines, its words whole (UX, 23 Nov).
  expect(italian300, "it, Me's card at 320 px / 300 %").toBe("OFFERTA / SPECIALE DI / NATALE");
});

// Your year's colour strip (the Web Tester's D2, UX 20 Nov): at large text a 4×3 grid, every month's label whole on one
// line inside its cell, in English (en-GB's "Sept" is its longest) and German ("Sept."); at the normal size a phone's
// strip is 6 across, as before. The page needs a session, so its markup is put on a public page at the width it has
// there: the app's gutter (12 px under 360 px, else 16) and the year card's 20 px each side.
test("Your year's strip at 360 px / 200 % and 320 px / 300 %: 4×3, every month on one line, in en and de", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  const cdp = await page.context().newCDPSession(page);
  const strip = (tag: string) => {
    const month = new Intl.DateTimeFormat(tag, { month: "short", timeZone: "UTC" });
    const items = Array.from(
      { length: 12 },
      (_, i) =>
        `<li class="${YEAR_MONTH}"><span aria-hidden="true" class="block h-[40px] w-full rounded-xl" style="background:#7a9"></span><span aria-hidden="true" data-month-label class="${YEAR_MONTH_LABEL}">${month.format(new Date(Date.UTC(2026, i, 1)))}</span></li>`,
    ).join("");
    // In its box, as on the page: the columns follow the strip's own width (a container query).
    return `<div class="${YEAR_STRIP_BOX}"><ol class="${YEAR_STRIP}" data-testid="year-strip">${items}</ol></div>`;
  };
  const read = () =>
    page.evaluate(() => {
      const ol = document.querySelector("[data-testid=year-strip]")!;
      const labels = [...ol.querySelectorAll("[data-month-label]")];
      return {
        columns: getComputedStyle(ol).gridTemplateColumns.split(" ").length,
        lines: labels.map((l) => new Set([...l.getClientRects()].map((r) => Math.round(r.top))).size),
        outside: labels.filter((l) => l.getBoundingClientRect().width > l.parentElement!.getBoundingClientRect().width + 0.5).map((l) => l.textContent),
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
  for (const [width, percent, inner] of [
    [360, 200, 360 - 2 * 16 - 2 * 20],
    [320, 300, 320 - 2 * 12 - 2 * 20],
  ] as const) {
    await page.setViewportSize({ width, height: 640 });
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: (16 * percent) / 100, fixed: (13 * percent) / 100 } });
    for (const [language, tag] of [["/", "en-GB"], ["/de", "de"]] as const) {
      await mountIn(page, language, inner, strip(tag));
      const where = `${tag} ${width} px / ${percent} %`;
      const got = await read();
      expect.soft(got.columns, `${where}: 4 across`).toBe(4);
      expect.soft(got.lines, `${where}: every month on one line`).toEqual(Array(12).fill(1));
      expect.soft(got.outside, `${where}: every month inside its cell`).toEqual([]);
      expect.soft(got.sideways, `${where}: no sideways scroll`).toBe(0);
    }
  }
  // The normal size: 6 across on a phone, as before (12 from sm).
  await page.setViewportSize({ width: 360, height: 640 });
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 16, fixed: 13 } });
  await mountIn(page, "/", 360 - 2 * 16 - 2 * 20, strip("en-GB"));
  const normal = await read();
  expect(normal.columns, "360 px / 100 %: 6 across").toBe(6);
  expect(normal.lines, "360 px / 100 %: every month on one line").toEqual(Array(12).fill(1));
});

// Your year's strip in every language at every phone size (UX, 25 Nov, after the Web Tester's f360 "Ja/n", which was #360's
// old head, without #416's 4×3; this sweep's first run then found labels wider than their cells, 6 across at 125–200 %):
// all twelve labels at their own size, one size, each month whole on one line inside its cell, from 320 to 430 px at
// 100–300 %; 4, 6 or 12 across by the strip's own width in em (under 15.5em 4, from 31em 12), 6 across at the normal size.
// The months are the browser's own (Intl), in each language's date formats (en-GB's "Sept", de "Sept.", fr "mars").
// Lines are counted from the label's text (a range's line boxes): the label is a flex item, a block, whose own rects are
// one box however many lines it holds. The widest label (its width over its size) is what the 15.5em and 31em rest on
// (largeText.ts): at most 2.8, checked here too.
test("Your year's strip: every month whole on one line, one size, every language, 320–430 px, 100–300 %", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Page.setFontSizes is Chromium's; once is enough");
  test.setTimeout(300_000);
  const cdp = await page.context().newCDPSession(page);
  const strip = (tag: string) => {
    const month = new Intl.DateTimeFormat(tag, { month: "short", timeZone: "UTC" });
    const items = Array.from(
      { length: 12 },
      (_, i) =>
        `<li class="${YEAR_MONTH}"><span aria-hidden="true" class="block h-[40px] w-full rounded-xl" style="background:#7a9"></span><span aria-hidden="true" data-month-label class="${YEAR_MONTH_LABEL}">${month.format(new Date(Date.UTC(2026, i, 1)))}</span></li>`,
    ).join("");
    return `<div data-strip-box class="${YEAR_STRIP_BOX}"><ol class="${YEAR_STRIP}" data-testid="year-strip">${items}</ol></div>`;
  };
  const wrong: string[] = [];
  const widest: Record<string, number> = {};
  const normal: string[] = [];
  for (const [language, tags] of [
    ["/", ["en-US", "en-GB"]],
    ["/fr", ["fr-FR"]],
    ["/es", ["es-ES", "es-MX"]],
    ["/pt-br", ["pt-BR"]],
    ["/de", ["de-DE"]],
    ["/it", ["it-IT"]],
    ["/th", ["th-TH"]],
  ] as const) {
    await page.goto(language);
    for (const width of [320, 360, 375, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 800 });
      for (const percent of [100, 112.5, 125, 137.5, 150, 175, 200, 250, 300]) {
        const root = (16 * percent) / 100;
        await cdp.send("Page.setFontSizes", { fontSizes: { standard: root, fixed: Math.round((13 * percent) / 100) } });
        for (const tag of tags) {
          const at = `${tag} ${width} px / ${percent} %`;
          // The year card's width on that phone: the app's gutter (12 px under 360 px, else 16) and the card's 20 px each side.
          const got = await page.evaluate(
            ([inner, html]) => {
              document.body.innerHTML = `<div style="width:${inner}px">${html}</div>`;
              const ol = document.querySelector("[data-testid=year-strip]")!;
              const labels = [...ol.querySelectorAll<HTMLElement>("[data-month-label]")];
              const lines = (l: HTMLElement) => {
                const range = document.createRange();
                range.selectNodeContents(l);
                return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
              };
              const box = document.querySelector<HTMLElement>("[data-strip-box]")!;
              return {
                root: getComputedStyle(document.documentElement).fontSize,
                boxEm: box.clientWidth / parseFloat(getComputedStyle(box).fontSize),
                columns: getComputedStyle(ol).gridTemplateColumns.split(" ").length,
                sizes: [...new Set(labels.map((l) => getComputedStyle(l).fontSize))],
                ratio: Math.max(...labels.map((l) => l.scrollWidth / parseFloat(getComputedStyle(l).fontSize))),
                split: labels.filter((l) => lines(l) !== 1).map((l) => l.textContent),
                outside: labels.filter((l) => l.scrollWidth > l.clientWidth + 0.5 || l.getBoundingClientRect().width > l.parentElement!.getBoundingClientRect().width + 0.5).map((l) => l.textContent),
              };
            },
            [String(width - 2 * (width < 360 ? 12 : 16) - 2 * 20), strip(tag)] as const,
          );
          expect(got.root, at).toBe(`${root}px`);
          if (got.split.length) wrong.push(`${at}: on more than one line: ${got.split.join(", ")}`);
          if (got.outside.length) wrong.push(`${at}: past its cell: ${got.outside.join(", ")}`);
          if (got.sizes.length !== 1) wrong.push(`${at}: ${got.sizes.length} sizes (${got.sizes.join(", ")})`);
          const across = got.boxEm >= 31 ? 12 : got.boxEm >= 15.5 ? 6 : 4;
          if (got.columns !== across) wrong.push(`${at}: ${got.columns} across in ${got.boxEm.toFixed(2)}em (expected ${across})`);
          if (percent === 100 && got.columns !== 6) normal.push(at);
          widest[tag] = Math.max(widest[tag] ?? 0, got.ratio);
        }
      }
    }
  }
  console.log(`Your year's widest month label, width over size: ${JSON.stringify(Object.fromEntries(Object.entries(widest).map(([k, v]) => [k, Number(v.toFixed(3))])))}`);
  expect(wrong, "a month split, past its cell, in another size, or the wrong number across").toEqual([]);
  expect(normal, "6 across on every phone at the normal size").toEqual([]);
  expect(Object.entries(widest).filter(([, v]) => v > 2.8), "a label wider than 2.8 of its size, which the 15.5em and 31em rest on").toEqual([]);
});

// UX, 20 Nov: /account-deletion is a help page, not legal text: French in French, no "in English" line.
test("/fr/account-deletion: the French page, no English notice", async ({ page }) => {
  await page.goto("/fr/account-deletion");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(fr.accountDeletion.title);
  await expect(page.getByTestId("page-notice")).toHaveCount(0);
  await expect(page.locator("article")).not.toHaveAttribute("lang", "en");
  // The address may end a line only after its "@".
  await expect(page.locator('article a[href^="mailto:"] wbr')).toHaveCount(1);
});
