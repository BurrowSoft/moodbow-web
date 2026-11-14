// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sentryOptions } from "@/sentry.shared";

// A mental-health journal never records sessions (UX & PM, 12 Nov): no Session Replay, no Feedback
// widget, no profiling, no tracing, in any runtime. These fail if any of it comes back in the code;
// e2e/sentry-bundle.spec.ts checks the built chunks too.
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
const SOURCES = [...files(join(process.cwd(), "src")), join(process.cwd(), "next.config.ts")].map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("Sentry: errors only, nothing that records", () => {
  it("no Replay, Feedback, profiling or tracing integration is set up anywhere", () => {
    const banned = /\b(replayIntegration|replayCanvasIntegration|feedbackIntegration|feedbackAsyncIntegration|sendFeedback|browserProfilingIntegration|browserTracingIntegration|nodeProfilingIntegration)\b/;
    expect(SOURCES.filter((f) => banned.test(f.text)).map((f) => f.path)).toEqual([]);
  });

  it("no sample rate that would turn them on", () => {
    expect(SOURCES.filter((f) => /\b(replaysSessionSampleRate|replaysOnErrorSampleRate|profilesSampleRate|profileSessionSampleRate)\b/.test(f.text)).map((f) => f.path)).toEqual([]);
    expect(sentryOptions.tracesSampleRate).toBe(0);
    expect(Object.keys(sentryOptions).filter((key) => /replay|profil/i.test(key))).toEqual([]);
  });

  it("the browser loads only init and captureRouterTransitionStart, never the whole module", () => {
    // A whole-module import keeps every export in the chunk (Replay's rrweb among them).
    // Browser code only: src/instrumentation.ts runs on the server (Node and Edge), not in pages.
    const whole = /import\(\s*["']@sentry\/(nextjs|browser|react)["']\s*\)|import \* as \w+ from ["']@sentry\/(nextjs|browser|react)["']/;
    const browser = SOURCES.filter((f) => !/[\\/]src[\\/]instrumentation\.ts$/.test(f.path));
    expect(browser.filter((f) => whole.test(f.text)).map((f) => f.path)).toEqual([]);
    const client = readFileSync(join(process.cwd(), "src/lib/sentryClient.ts"), "utf8");
    expect(client).toMatch(/export \{ captureRouterTransitionStart, init \} from "@sentry\/nextjs";/);
  });
});
