import { sentryOptions } from "./sentry.shared";
import { withoutSessions } from "./lib/sentrySessions";

// Browser-side Sentry. The DSN is public by design (it only allows sending
// events). Unset locally and in CI, so nothing is sent from there.
// Started once the page is idle (UX & PM, perf fix 1): the SDK is about
// 130 kB of script that would otherwise load and run before the page is
// usable, and the few errors of the very first second aren't worth that.
// It's a dynamic import, so the SDK isn't in the page's first scripts at all.
type SentryModule = typeof import("@sentry/nextjs");

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const IDLE_TIMEOUT_MS = 2000;
let sentry: SentryModule | null = null;

export function startSentry(): Promise<void> {
  return import("@sentry/nextjs").then((S) => {
    S.init({ dsn, ...sentryOptions, integrations: withoutSessions });
    sentry = S;
  });
}

if (dsn && typeof window !== "undefined") {
  const start = () => void startSentry();
  // After the page's load event, then when idle: an idle callback alone can
  // fire mid-load (Web Tester, #77), still competing with the page on slow 4G.
  const whenIdle = () => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS });
    else window.setTimeout(start, IDLE_TIMEOUT_MS);
  };
  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle, { once: true });
}

// Navigations before Sentry has started simply aren't recorded.
export function onRouterTransitionStart(...args: Parameters<SentryModule["captureRouterTransitionStart"]>): void {
  sentry?.captureRouterTransitionStart(...args);
}
