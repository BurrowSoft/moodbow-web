import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// When a page view is handed to Vercel Analytics: once the page has
// arrived (no loading boundary left), never for a not-found page, with the
// route pattern and not the ids (Web Tester, #30).
let pathname = "/help/getting-started";
let params: Record<string, string> = { slug: "getting-started" };
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useParams: () => params }));
const seen: { route?: string | null; path?: string }[] = [];
vi.mock("@vercel/analytics/react", () => ({
  Analytics: (props: { route?: string | null; path?: string }) => {
    seen.push({ route: props.route, path: props.path });
    return null;
  },
}));
const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@vercel/analytics", async (original) => ({ ...(await original<typeof import("@vercel/analytics")>()), track }));
const { VisitCounts, SETTLE_LIMIT_MS, browserSaysNo } = await import("./VisitCounts");
const { countTap } = await import("@/lib/analyticsEvents");

const last = () => seen[seen.length - 1];
const add = (attr: string) => {
  const el = document.createElement("div");
  el.setAttribute(attr, "");
  document.body.appendChild(el);
  return el;
};
// MutationObserver callbacks are microtasks.
const flush = () => act(async () => {});

beforeEach(() => {
  seen.length = 0;
  document.body.innerHTML = "";
  pathname = "/help/getting-started";
  params = { slug: "getting-started" };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("VisitCounts", () => {
  it("a page already there: counted at once, as the route pattern", async () => {
    render(<VisitCounts />);
    await flush();
    expect(last()).toEqual({ route: "/help/[slug]", path: pathname });
  });

  it("while the loading boundary shows: nothing (route null, so no auto-tracking); counted when the page arrives", async () => {
    const loading = add("data-loading-boundary");
    render(<VisitCounts />);
    await flush();
    expect(last()).toEqual({ route: null, path: undefined });
    loading.remove();
    await flush();
    expect(last()).toEqual({ route: "/help/[slug]", path: pathname });
  });

  it("the loading boundary is replaced by a not-found page: never counted", async () => {
    const loading = add("data-loading-boundary");
    render(<VisitCounts />);
    await flush();
    loading.remove();
    add("data-not-found");
    await flush();
    expect(seen.every((s) => s.route === null && s.path === undefined)).toBe(true);
  });

  it("nothing arrives within 30 s: nothing is counted, even if it arrives later", async () => {
    vi.useFakeTimers();
    const loading = add("data-loading-boundary");
    render(<VisitCounts />);
    act(() => vi.advanceTimersByTime(SETTLE_LIMIT_MS));
    loading.remove();
    await flush();
    expect(last()).toEqual({ route: null, path: undefined });
  });

  it("page → not-found → back: the first page waits to arrive again", async () => {
    const view = render(<VisitCounts />);
    await flush();
    const first = pathname;
    pathname = "/help/nope";
    params = { slug: "nope" };
    const missing = add("data-not-found");
    view.rerender(<VisitCounts />);
    await flush();
    expect(last()).toEqual({ route: null, path: undefined });
    missing.remove();
    const loading = add("data-loading-boundary");
    pathname = first;
    params = { slug: "getting-started" };
    view.rerender(<VisitCounts />);
    await flush();
    expect(last()).toEqual({ route: null, path: undefined });
    loading.remove();
    await flush();
    expect(last()).toEqual({ route: "/help/[slug]", path: first });
  });

  it("a new page: reset, then counted again once it arrives", async () => {
    const view = render(<VisitCounts />);
    await flush();
    expect(last().path).toBe(pathname);
    const loading = add("data-loading-boundary");
    pathname = "/support";
    params = {};
    view.rerender(<VisitCounts />);
    await flush();
    expect(last()).toEqual({ route: null, path: undefined });
    loading.remove();
    await flush();
    expect(last()).toEqual({ route: "/support", path: "/support" });
  });
});

describe("VisitCounts: the journal counts too (UX Q2), the safety plan never", () => {
  it("journal pages count by their route pattern, never the ids", async () => {
    pathname = "/app/entries/3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
    params = { locale: "en", id: "3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b" };
    render(<VisitCounts />);
    await flush();
    expect(last().route).toBe("/app/entries/[id]");
  });

  it("the safety plan (any locale) and the auth email-link pages: never counted", async () => {
    for (const p of ["/app/me/safety-plan", "/th/app/me/safety-plan", "/auth/confirm"]) {
      pathname = p;
      params = {};
      const view = render(<VisitCounts />);
      await flush();
      expect(seen.every((x) => x.route === null && x.path === undefined), p).toBe(true);
      view.unmount();
    }
  });
});

describe("VisitCounts: the browser's own no (UX Q8)", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "globalPrivacyControl", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "doNotTrack", { value: null, configurable: true });
  });

  it("Global Privacy Control or Do Not Track: nothing renders, and taps stay off", async () => {
    for (const [key, value] of [["globalPrivacyControl", true], ["doNotTrack", "1"]] as const) {
      seen.length = 0;
      track.mockClear();
      Object.defineProperty(navigator, key, { value, configurable: true });
      const view = render(<VisitCounts />);
      await flush();
      expect(seen, key).toEqual([]);
      countTap("entry_saved");
      expect(track, key).not.toHaveBeenCalled();
      view.unmount();
      Object.defineProperty(navigator, key, { value: key === "doNotTrack" ? null : undefined, configurable: true });
    }
  });

  it("browserSaysNo reads both signals", () => {
    expect(browserSaysNo({ globalPrivacyControl: true } as unknown as Navigator)).toBe(true);
    expect(browserSaysNo({ doNotTrack: "1" } as unknown as Navigator)).toBe(true);
    expect(browserSaysNo({ doNotTrack: "0" } as unknown as Navigator)).toBe(false);
    expect(browserSaysNo({} as Navigator)).toBe(false);
  });
});

describe("VisitCounts: taps", () => {
  beforeEach(() => track.mockClear());

  it("a tap on a data-count button sends its name only; off again once unmounted", async () => {
    const view = render(<VisitCounts />);
    await flush();
    const button = document.createElement("a");
    button.setAttribute("data-count", "cta_home_start");
    button.innerHTML = "<span>Start your journal</span>";
    document.body.appendChild(button);
    act(() => button.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("cta_home_start");
    view.unmount();
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    countTap("entry_saved");
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("a name off the list, or a choice outside its values: nothing", async () => {
    render(<VisitCounts />);
    await flush();
    const add2 = (attrs: Record<string, string>) => {
      const el = document.createElement("button");
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      document.body.appendChild(el);
      act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    };
    add2({ "data-count": "help_call_helpline" });
    add2({ "data-count": "language_switch", "data-count-locale": "klingon" });
    add2({ "data-count": "language_switch" });
    expect(track).not.toHaveBeenCalled();
    add2({ "data-count": "language_switch", "data-count-locale": "th" });
    expect(track).toHaveBeenCalledWith("language_switch", { locale: "th" });
  });
});
