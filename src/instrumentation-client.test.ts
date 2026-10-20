import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Browser Sentry starts only once the page is idle (perf fix 1), through a
// dynamic import, and never without a DSN.
const init = vi.fn();
const captureRouterTransitionStart = vi.fn();
vi.mock("@sentry/nextjs", () => ({ init, captureRouterTransitionStart }));

let idle: (() => void) | null = null;
beforeEach(() => {
  vi.resetModules();
  init.mockReset();
  captureRouterTransitionStart.mockReset();
  idle = null;
  Object.assign(window, { requestIdleCallback: vi.fn((cb: () => void) => ((idle = cb), 1)) });
});
afterEach(() => vi.unstubAllEnvs());

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("instrumentation-client", () => {
  it("with a DSN: nothing at load; init once the browser is idle, without sessions and with the shared options", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o0.ingest.sentry.io/1");
    const mod = await import("./instrumentation-client");
    expect(init).not.toHaveBeenCalled();
    expect(window.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    idle!();
    await settle();
    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0][0];
    expect(options).toMatchObject({ dsn: "https://key@o0.ingest.sentry.io/1", tracesSampleRate: 0 });
    expect(options.integrations([{ name: "BrowserSession" }, { name: "Dedupe" }])).toEqual([{ name: "Dedupe" }]);
    // Router transitions reach Sentry once it has started, not before.
    mod.onRouterTransitionStart("/app", "push");
    expect(captureRouterTransitionStart).toHaveBeenCalledWith("/app", "push");
  });

  it("navigations before Sentry starts are dropped quietly", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o0.ingest.sentry.io/1");
    const mod = await import("./instrumentation-client");
    expect(() => mod.onRouterTransitionStart("/app", "push")).not.toThrow();
    expect(captureRouterTransitionStart).not.toHaveBeenCalled();
  });

  it("no requestIdleCallback (Safari): a 2 s timer instead", async () => {
    vi.useFakeTimers();
    try {
      Object.assign(window, { requestIdleCallback: undefined });
      vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o0.ingest.sentry.io/1");
      await import("./instrumentation-client");
      await vi.advanceTimersByTimeAsync(1999);
      expect(init).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await vi.runAllTimersAsync();
      expect(init).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no DSN (local, CI): Sentry never starts", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    await import("./instrumentation-client");
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
  });
});
