import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The in-app navigation bar: shown 300 ms after an internal link click while
// the location hasn't changed yet, gone on arrival; aria-busy on main.
let pathname = "/app";
let search = "";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams(search) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => `app.${key}` }));
const { NavProgress } = await import("./NavProgress");

function setup() {
  document.body.innerHTML = "";
  const main = document.createElement("main");
  main.id = "main";
  document.body.appendChild(main);
  const link = (href: string, attrs: Record<string, string> = {}) => {
    const a = document.createElement("a");
    a.href = href;
    for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
    // Like Next's Link: no full page load in the test.
    a.addEventListener("click", (e) => e.preventDefault());
    main.appendChild(a);
    return a;
  };
  const view = render(<NavProgress />, { container: document.body.appendChild(document.createElement("div")) });
  return { main, link, view };
}

beforeEach(() => {
  vi.useFakeTimers();
  pathname = "/app";
  search = "";
  window.history.replaceState(null, "", "/app");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("NavProgress", () => {
  it("nothing before 300 ms; then the bar and aria-busy on main; gone (and not busy) on arrival", () => {
    const { main, link, view } = setup();
    fireEvent.click(link("/app/timeline"));
    act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByTestId("nav-progress")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("nav-progress")).toBeInTheDocument();
    expect(main).toHaveAttribute("aria-busy", "true");

    pathname = "/app/timeline";
    window.history.replaceState(null, "", "/app/timeline");
    view.rerender(<NavProgress />);
    expect(screen.queryByTestId("nav-progress")).toBeNull();
    expect(main).not.toHaveAttribute("aria-busy");
  });

  it("a fast navigation never shows it", () => {
    const { link, view } = setup();
    fireEvent.click(link("/app/me"));
    act(() => vi.advanceTimersByTime(100));
    pathname = "/app/me";
    view.rerender(<NavProgress />);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByTestId("nav-progress")).toBeNull();
  });

  it("a search-only navigation counts too (Insights ?range=)", () => {
    const { link, view } = setup();
    pathname = "/app/insights";
    window.history.replaceState(null, "", "/app/insights");
    view.rerender(<NavProgress />);
    fireEvent.click(link("/app/insights?range=month"));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId("nav-progress")).toBeInTheDocument();
    search = "range=month";
    view.rerender(<NavProgress />);
    expect(screen.queryByTestId("nav-progress")).toBeNull();
  });

  it("ignored: new-tab clicks, external links, downloads, the page you're on", () => {
    const { link } = setup();
    fireEvent.click(link("/app/timeline"), { metaKey: true });
    fireEvent.click(link("https://example.com/x"));
    fireEvent.click(link("/app/timeline", { target: "_blank" }));
    fireEvent.click(link("/file.txt", { download: "" }));
    fireEvent.click(link("/app"));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByTestId("nav-progress")).toBeNull();
  });

  it("gives up after 30 s if nothing arrives", () => {
    const { main, link } = setup();
    fireEvent.click(link("/app/timeline"));
    act(() => vi.advanceTimersByTime(29_999));
    expect(screen.getByTestId("nav-progress")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId("nav-progress")).toBeNull();
    expect(main).not.toHaveAttribute("aria-busy");
  });
});

describe("NavProgress: every click waits its own 300 ms (reviewer #28)", () => {
  it("A → B → A, then a click from A doesn't show the bar at once", () => {
    const { link, view } = setup();
    fireEvent.click(link("/app/timeline"));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId("nav-progress")).toBeInTheDocument();
    pathname = "/app/timeline";
    window.history.replaceState(null, "", "/app/timeline");
    view.rerender(<NavProgress />);
    pathname = "/app";
    window.history.replaceState(null, "", "/app");
    view.rerender(<NavProgress />);
    fireEvent.click(link("/app/me"));
    expect(screen.queryByTestId("nav-progress")).toBeNull();
    act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByTestId("nav-progress")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("nav-progress")).toBeInTheDocument();
  });
});

describe("NavProgress: the 3 s line when no loading boundary shows it (UX, #28)", () => {
  it("empty live region under the bar; the line at 3 s; gone on arrival", () => {
    const { link, view } = setup();
    fireEvent.click(link("/app/timeline"));
    act(() => vi.advanceTimersByTime(300));
    const line = screen.getByTestId("nav-slow");
    expect(line).toHaveAttribute("role", "status");
    expect(line).toBeEmptyDOMElement();
    // The bar is decorative; the line isn't inside its aria-hidden part.
    expect(line.closest("[aria-hidden]")).toBeNull();
    act(() => vi.advanceTimersByTime(2699));
    expect(line).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(1));
    expect(line).toHaveTextContent("app.slowLoading");

    pathname = "/app/timeline";
    window.history.replaceState(null, "", "/app/timeline");
    view.rerender(<NavProgress />);
    expect(screen.queryByTestId("nav-slow")).toBeNull();
  });

  it("not when a loading boundary is showing its own line", () => {
    const { main, link } = setup();
    const boundary = document.createElement("div");
    boundary.setAttribute("data-loading-boundary", "");
    main.appendChild(boundary);
    fireEvent.click(link("/app/timeline"));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId("nav-slow")).toBeEmptyDOMElement();
  });

  it("each click starts its own 3 s", () => {
    const { link, view } = setup();
    fireEvent.click(link("/app/timeline"));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId("nav-slow")).toHaveTextContent("app.slowLoading");
    pathname = "/app/timeline";
    window.history.replaceState(null, "", "/app/timeline");
    view.rerender(<NavProgress />);
    fireEvent.click(link("/app/me"));
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByTestId("nav-slow")).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("nav-slow")).toHaveTextContent("app.slowLoading");
  });
});
