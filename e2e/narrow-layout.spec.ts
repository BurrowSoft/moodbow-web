import { expect, test, type Page } from "@playwright/test";
import messages from "../src/messages/en.json";
import { APP_MAIN_GUTTER, JOURNAL_CARD, MOOD_FACE, MOOD_LABEL, MOOD_ROW, PRIMARY_SAVE, TAB_ITEM, TAB_LABEL, TAB_LINK_NARROW } from "../src/lib/ui/journalLayout";

// The web journal's narrow layout in a real browser (jsdom can't lay out).
// The journal pages need a session, so this builds the same markup from the
// same class strings (lib/ui/journalLayout.ts) on a public page, which
// loads the app's full stylesheet. Decisions 105 and 119; Web Tester +
// reviewer on #26.

// A 320 px window (the min-[360px] gutters apply); the content box is set
// explicitly, so the result doesn't depend on the runner's scrollbars.
async function mount(page: Page, width: number, html: string, viewport = 320) {
  await page.setViewportSize({ width: viewport, height: 640 });
  await page.goto("/");
  await page.evaluate(
    ([w, inner]) => {
      document.body.innerHTML = `<div id="probe" style="width:${w}px">${inner}</div>`;
    },
    [String(width), html] as const,
  );
}

const faces = Array.from({ length: 5 }, (_, i) => `<button type="button" role="radio" class="${MOOD_FACE}"><span class="h-9 w-9 shrink-0 rounded-full bg-accent"></span><span class="${MOOD_LABEL}">${messages.today[`mood${i + 1}` as "mood1"]}</span></button>`).join("");
const moodRow = `<div class="@container" id="row-box"><div class="${MOOD_ROW}" role="radiogroup">${faces}</div></div>`;

async function oneRow(page: Page) {
  const boxes = await page.getByRole("radio").evaluateAll((els) => els.map((e) => ({ top: (e as HTMLElement).offsetTop, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })));
  expect(boxes).toHaveLength(5);
  expect(new Set(boxes.map((b) => b.top)).size, JSON.stringify(boxes)).toBe(1);
  for (const b of boxes) {
    expect(b.w).toBeGreaterThanOrEqual(48);
    expect(b.h).toBeGreaterThanOrEqual(48);
  }
  // All five labels shown (UX, superseding decision 105), each on one line
  // under its face at the default text size, as in the mockup.
  const labels = await page.locator(`#row-box button > span:last-child`).evaluateAll((els) =>
    els.map((e) => ({ h: e.getBoundingClientRect().height, line: parseFloat(getComputedStyle(e).lineHeight), scroll: e.scrollWidth, client: e.clientWidth })),
  );
  expect(labels).toHaveLength(5);
  for (const l of labels) {
    expect(l.h, JSON.stringify(l)).toBeLessThanOrEqual(l.line + 1);
    expect(l.scroll).toBeLessThanOrEqual(l.client);
  }
}

const TAB_KEYS = ["tabToday", "tabTimeline", "tabInsights", "tabMe"] as const;
const tabs = TAB_KEYS.map(
  (k) =>
    `<li class="${TAB_ITEM}"><a href="#" title="${messages.app[k]}" class="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl ${TAB_LINK_NARROW} text-xs font-medium"><span class="h-6 w-6"></span><span class="${TAB_LABEL}">${messages.app[k]}</span></a></li>`,
).join("");

test.describe("narrow journal layout", () => {
  test("a 255 px mood row holds all five 48 px faces on one row", async ({ page }) => {
    await mount(page, 255, moodRow);
    await oneRow(page);
  });

  test("a 320 px window with a classic scrollbar (305 px): the gutters leave 255 px, one row", async ({ page }) => {
    await mount(page, 305, `<main class="${APP_MAIN_GUTTER}"><form class="${JOURNAL_CARD}">${moodRow}</form></main>`);
    expect(await page.locator("#row-box").evaluate((e) => e.clientWidth)).toBe(255);
    await oneRow(page);
  });

  test("200% zoom (a 160 px page): Save and the four tabs stay inside the page, no overlap", async ({ page }) => {
    await mount(
      page,
      160,
      `<main class="${APP_MAIN_GUTTER}"><form class="${JOURNAL_CARD}"><button type="submit" id="save" class="mt-6 ${PRIMARY_SAVE}">${messages.today.checkinSave}</button></form></main><nav><ul class="grid grid-cols-4">${tabs}</ul></nav>`,
    );
    const probe = await page.locator("#probe").evaluate((e) => ({ right: e.getBoundingClientRect().right, scroll: e.scrollWidth, client: e.clientWidth }));
    expect(probe.scroll).toBeLessThanOrEqual(probe.client);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const save = await page.locator("#save").evaluate((e) => ({ right: e.getBoundingClientRect().right, scroll: e.scrollWidth, client: e.clientWidth }));
    expect(save.right).toBeLessThanOrEqual(probe.right);
    expect(save.scroll).toBeLessThanOrEqual(save.client);

    const links = await page.locator("nav a").evaluateAll((els) => els.map((e) => ({ ...e.getBoundingClientRect().toJSON(), scroll: e.scrollWidth, client: e.clientWidth })));
    for (const [i, l] of links.entries()) {
      expect(l.scroll, `tab ${i} label fits its cell`).toBeLessThanOrEqual(l.client);
      if (i > 0) expect(l.left, `tab ${i} starts after tab ${i - 1}`).toBeGreaterThanOrEqual(links[i - 1].right - 0.5);
    }
  });

  test("a 160 px viewport (200%+ zoom on a phone): the tabs are icons only, each still named by its label, nothing breaks mid-word", async ({ page }) => {
    await mount(page, 160, `<nav><ul class="grid grid-cols-4">${tabs}</ul></nav>`, 160);
    for (const k of TAB_KEYS) {
      const link = page.getByRole("link", { name: messages.app[k], exact: true });
      await expect(link).toHaveCount(1);
      await expect(link.getByText(messages.app[k], { exact: true })).toHaveCSS("position", "absolute");
    }
  });

  test("from 240 px the labels show again", async ({ page }) => {
    await mount(page, 240, `<nav><ul class="grid grid-cols-4">${tabs}</ul></nav>`, 241);
    for (const k of TAB_KEYS) await expect(page.getByText(messages.app[k], { exact: true })).not.toHaveCSS("position", "absolute");
  });
});
