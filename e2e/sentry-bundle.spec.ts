import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";

// What the browser can download, read from the build itself (.next/static, after `npm run build`):
// none of Session Replay (rrweb), the Feedback widget or the profiler may be in any chunk. A
// mental-health journal never records sessions (UX & PM, 12 Nov). The markers are string
// literals those packages carry, which minifying keeps. The Sentry chunk's size is printed, to
// compare with the Web Tester's 155 KB gzipped before (plans/perf-2026-11-12.md).
const chunks = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? chunks(path) : name.endsWith(".js") ? [path] : [];
  });

const MARKERS: [string, RegExp][] = [
  ["Session Replay (rrweb)", /__rrweb|rr-block|rr-mask/],
  ["the Feedback widget", /sentry-feedback/],
  ["browser profiling", /BrowserProfiling/],
];

test("the browser's chunks hold no Session Replay, Feedback widget or profiler", ({ browserName }, testInfo) => {
  test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "a build check: once is enough");
  const dir = join(process.cwd(), ".next", "static");
  const files = chunks(dir).map((path) => ({ path: path.slice(dir.length + 1), text: readFileSync(path, "utf8") }));
  expect(files.length).toBeGreaterThan(0);
  const found = MARKERS.flatMap(([what, marker]) => files.filter((f) => marker.test(f.text)).map((f) => `${what}: ${f.path}`));
  // The SDK's chunk: the one that names the Sentry browser SDK.
  const sdk = files.filter((f) => /sentry\.javascript\./.test(f.text));
  const sizes = sdk.map((f) => `${f.path} ${Math.round(Buffer.byteLength(f.text) / 1024)} KB, ${Math.round(gzipSync(f.text).length / 1024)} KB gzipped`);
  console.log(`Sentry's chunks: ${sizes.join("; ") || "none found"}. BrowserTracing named in: ${files.filter((f) => /BrowserTracing/.test(f.text)).length} chunk(s).`);
  expect(found).toEqual([]);
});
