import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The in-app navigation bar: shown 300 ms after an internal link click while
// the location hasn't changed yet, gone on arrival; aria-busy on main.
let pathname = "/app";
let search = "";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams(search) }));
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
