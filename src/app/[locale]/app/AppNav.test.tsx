import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// The journal nav highlights the parent tab (decision 152): an entry or New
// entry belongs to where it was opened from, Today by default.
let pathname = "/app";
let search = "";
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathname,
  Link: (p: { href: string; children: React.ReactNode; "aria-current"?: string; "data-testid"?: string; className?: string }) => (
    <a href={p.href} aria-current={p["aria-current"] as "page" | undefined} data-testid={p["data-testid"]}>
      {p.children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));
const { AppNav } = await import("./AppNav");
afterEach(cleanup);

const current = (path: string, query = "") => {
  pathname = path;
  search = query;
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AppNav />
    </NextIntlClientProvider>,
  );
  return ["tab-today", "tab-timeline", "tab-insights", "tab-me"].filter((id) => screen.getByTestId(id).getAttribute("aria-current") === "page");
};

describe("AppNav: the parent tab (decision 152)", () => {
  it("each tab and the pages under it", () => {
    expect(current("/app")).toEqual(["tab-today"]);
    cleanup();
    expect(current("/app/timeline/2026-10-02")).toEqual(["tab-timeline"]);
    cleanup();
    expect(current("/app/me")).toEqual(["tab-me"]);
  });

  it("an entry or New entry: the tab it came from; Today on a direct load or a bad ?from", () => {
    expect(current("/app/entries/e1", "from=%2Fapp%2Ftimeline")).toEqual(["tab-timeline"]);
    cleanup();
    expect(current("/app/entries/e1", "from=%2Fapp%2Ftimeline%2F2026-10-02")).toEqual(["tab-timeline"]);
    cleanup();
    expect(current("/app/entries/e1")).toEqual(["tab-today"]);
    cleanup();
    expect(current("/app/write", "from=https%3A%2F%2Fevil.example")).toEqual(["tab-today"]);
  });
});
