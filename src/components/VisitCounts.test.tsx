import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// When a page view is handed to Vercel Analytics: once the page has
// arrived (no loading boundary left), never for a not-found page, with the
// route pattern and not the ids (Web Tester, #30).
let pathname = "/app/entries/3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
let params: Record<string, string> = { id: "3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b" };
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useParams: () => params }));
const seen: { route?: string | null; path?: string }[] = [];
vi.mock("@vercel/analytics/react", () => ({
  Analytics: (props: { route?: string | null; path?: string }) => {
    seen.push({ route: props.route, path: props.path });
    return null;
  },
}));
const { VisitCounts, SETTLE_LIMIT_MS } = await import("./VisitCounts");

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
  pathname = "/app/entries/3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
  params = { id: "3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b" };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("VisitCounts", () => {
  it("a page already there: counted at once, as the route pattern", async () => {
    render(<VisitCounts />);
    await flush();
    expect(last()).toEqual({ route: "/app/entries/[id]", path: pathname });
  });

  it("while the loading boundary shows: nothing (route null, so no auto-tracking); counted when the page arrives", async () => {
    const loading = add("data-loading-boundary");
    render(<VisitCounts />);
    await flush();
    expect(last()).toEqual({ route: null, path: undefined });
    loading.remove();
    await flush();
    expect(last()).toEqual({ route: "/app/entries/[id]", path: pathname });
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
    params = { id: "3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b" };
    view.rerender(<VisitCounts />);
    await flush();
    expect(last()).toEqual({ route: null, path: undefined });
    loading.remove();
    await flush();
    expect(last()).toEqual({ route: "/app/entries/[id]", path: first });
  });

  it("a new page: reset, then counted again once it arrives", async () => {
    const view = render(<VisitCounts />);
    await flush();
    expect(last().path).toBe(pathname);
    const loading = add("data-loading-boundary");
    pathname = "/app/timeline";
    params = {};
    view.rerender(<VisitCounts />);
    await flush();
    expect(last()).toEqual({ route: null, path: undefined });
    loading.remove();
    await flush();
    expect(last()).toEqual({ route: "/app/timeline", path: "/app/timeline" });
  });
});
