import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// Automated accessibility (UX, 2026-11-12): no serious or critical axe violation on a page, at
// a phone's width and a desktop's. Lesser ones are logged, not failed. axe can't hear a screen
// reader or judge wording, so the Web Tester's rows and the TalkBack passes still stand.
export const AXE_WIDTHS = [320, 1280] as const;
const FAILING = new Set(["serious", "critical"]);

export type AxeCount = { where: string; width: number; serious: number; critical: number; other: number };

// One page, as it is now. exclude: selectors left out on purpose (say why where it's called).
export async function axeCheck(page: Page, where: string, { exclude = [] as string[] } = {}): Promise<AxeCount> {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  for (const selector of exclude) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  const width = page.viewportSize()?.width ?? 0;
  const count: AxeCount = { where, width, serious: 0, critical: 0, other: 0 };
  for (const v of violations) {
    if (v.impact === "serious") count.serious += v.nodes.length;
    else if (v.impact === "critical") count.critical += v.nodes.length;
    else count.other += v.nodes.length;
    // In the run's log, so a red run says what and where.
    console.log(`axe ${where} @${width}px: ${v.impact} ${v.id} (${v.nodes.length}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 5).join(" | ")}`);
  }
  console.log(`axe ${where} @${width}px: serious ${count.serious}, critical ${count.critical}, other ${count.other}`);
  const failing = violations.filter((v) => FAILING.has(v.impact ?? "")).map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  expect.soft(failing, `axe, serious or critical, ${where} at ${width} px`).toEqual([]);
  return count;
}

// The same page at each width: open() puts the page in the state to check (it runs after each
// resize, so a layout that changes with the width is checked as it really is).
export async function axeAtWidths(page: Page, where: string, open: () => Promise<void>, options?: { exclude?: string[] }): Promise<AxeCount[]> {
  const before = page.viewportSize();
  const counts: AxeCount[] = [];
  for (const width of AXE_WIDTHS) {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 800 });
    await open();
    counts.push(await axeCheck(page, where, options));
  }
  if (before) await page.setViewportSize(before);
  return counts;
}
