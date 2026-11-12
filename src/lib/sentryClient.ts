// The browser's Sentry: only the two calls the app makes, by name, so the bundler keeps just these
// and what they need. Loading "@sentry/nextjs" as a whole module (import("@sentry/nextjs")) kept
// every export in the chunk, Session Replay (rrweb), the Feedback widget, the Profiler and tracing
// among them: none of it ran, but every page downloaded it (the Web Tester's performance pass,
// 12 Nov). A mental-health journal never records sessions (UX & PM): Replay, Feedback and
// profiling stay out entirely, errors only. Guarded by tests (sentryClient.test.ts) and by the
// built chunks themselves (e2e/sentry-bundle.spec.ts).
export { captureRouterTransitionStart, init } from "@sentry/nextjs";

// Never in the browser, whatever a future SDK adds to its defaults: sessions (decision 49), and
// anything that records, profiles or traces.
const NOT_IN_THE_BROWSER = /Session|Replay|Feedback|Profiling|BrowserTracing/;

export function errorsOnly<T extends { name: string }>(defaults: T[]): T[] {
  return defaults.filter((i) => !NOT_IN_THE_BROWSER.test(i.name));
}
