import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Web performance (UX & PM, option A): each page in Chromium with Lighthouse's
// mobile profile (4× CPU slowdown, slow 4G: 150 ms RTT, 1.6 Mbps down,
// 750 kbps up), measured with web-vitals 6 (already in node_modules through
// Next). Not Lighthouse scores: the same metrics under the same throttling.
// Median of RUNS fresh loads per page. Opt-in only (never CI):
//   npm run build && npm run perf            (public pages, drafts on)
//   PERF_PAGES=/,/support npm run perf
// Journal mode (the Web Tester, against a staging build): PERF_EMAIL and
// PERF_PASSWORD (a throwaway staging user they seed and delete) sign in once
// through the UI, unthrottled; the journal pages then load with that session
// (cookies in a temp file, deleted afterwards). Neither value is ever logged.
// Results: perf-results.json (gitignored) and the console.
const RUNS = Number(process.env.PERF_RUNS ?? 5);
const JOURNAL = !!process.env.PERF_EMAIL && !!process.env.PERF_PASSWORD;
const PAGES = (process.env.PERF_PAGES ?? (JOURNAL ? "/app,/app/timeline,/app/insights,/app/me" : "/,/support,/welcome,/sign-in,/consent,/help,/privacy,/terms")).split(",");
const VITALS = readFileSync(join(process.cwd(), "node_modules/web-vitals/dist/web-vitals.iife.js"), "utf8");

type Sample = { lcp: number; cls: number; fcp: number; ttfb: number; inp: number | null; tbt: number; longTasks: number; lcpElement: string };

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

async function measure(page: Page, path: string): Promise<Sample> {
  await page.addInitScript(`${VITALS};
    window.__v = { cls: 0, inp: null, long: [] };
    webVitals.onLCP((m) => { window.__v.lcp = m.value; const e = m.entries.at(-1)?.element; window.__v.lcpElement = e ? e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.getAttribute("data-testid") ? "[" + e.getAttribute("data-testid") + "]" : "") : "?"; }, { reportAllChanges: true });
    webVitals.onCLS((m) => { window.__v.cls = m.value; }, { reportAllChanges: true });
    webVitals.onFCP((m) => { window.__v.fcp = m.value; });
    webVitals.onTTFB((m) => { window.__v.ttfb = m.value; });
    webVitals.onINP((m) => { window.__v.inp = m.value; }, { reportAllChanges: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__v.long.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true });`);
  await throttle(page);
  await page.goto(path, { waitUntil: "load" });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  // One tap on a neutral spot: ends LCP observation and gives INP a sample.
  await page.mouse.click(5, 5);
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    const v = (window as unknown as { __v: { lcp?: number; cls: number; fcp?: number; ttfb?: number; inp: number | null; long: [number, number][]; lcpElement?: string } }).__v;
    // TBT as Lighthouse counts it: each long task's time over 50 ms, after FCP.
    const after = v.long.filter(([start]) => start >= (v.fcp ?? 0));
    return { lcp: v.lcp ?? NaN, cls: v.cls, fcp: v.fcp ?? NaN, ttfb: v.ttfb ?? NaN, inp: v.inp, tbt: after.reduce((s, [, d]) => s + Math.max(0, d - 50), 0), longTasks: v.long.length, lcpElement: v.lcpElement ?? "?" };
  });
}

const median = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

const results: Record<string, Record<string, number | string | null>> = {};

test.describe.configure({ mode: "serial", timeout: 300_000 });

let session: string | undefined;
let sessionDir: string | undefined;
test.beforeAll(async ({ browser }) => {
  if (!JOURNAL) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(process.env.PERF_EMAIL!);
  await page.getByLabel("Password").fill(process.env.PERF_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app$/, { timeout: 20_000 });
  sessionDir = mkdtempSync(join(tmpdir(), "mb-perf-"));
  session = join(sessionDir, "state.json");
  await context.storageState({ path: session });
  await context.close();
});

for (const path of PAGES) {
  test(`vitals ${path}`, async ({ browser }) => {
    const samples: Sample[] = [];
    for (let i = 0; i < RUNS; i++) {
      // A fresh context each run: a cold cache, like a first visit.
      const context = await browser.newContext({ storageState: session, viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, locale: "en-US" });
      const page = await context.newPage();
      samples.push(await measure(page, path));
      await context.close();
    }
    const inps = samples.map((s) => s.inp).filter((x): x is number => x !== null);
    results[path] = {
      lcp: Math.round(median(samples.map((s) => s.lcp))),
      cls: Number(median(samples.map((s) => s.cls)).toFixed(3)),
      fcp: Math.round(median(samples.map((s) => s.fcp))),
      ttfb: Math.round(median(samples.map((s) => s.ttfb))),
      inp: inps.length ? Math.round(median(inps)) : null,
      tbt: Math.round(median(samples.map((s) => s.tbt))),
      longTasks: median(samples.map((s) => s.longTasks)),
      lcpElement: samples.at(-1)!.lcpElement,
    };
    console.log(path, JSON.stringify(results[path]));
    expect(samples).toHaveLength(RUNS);
  });
}

test.afterAll(() => {
  if (sessionDir) rmSync(sessionDir, { recursive: true, force: true });
  writeFileSync("perf-results.json", `${JSON.stringify(results, null, 2)}\n`);
});
