import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import messages from "@/messages/en.json";
import { parseView, viewCookie, type TimelineView } from "@/lib/journal/timelineView";
import { TimelineViews } from "./TimelineViews";

const t = messages.timeline;
const views = (initialView: TimelineView) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    <TimelineViews initialView={initialView} list={<p data-testid="the-list" />} calendar={<p data-testid="the-calendar" />} />
  </NextIntlClientProvider>
);

// document.cookie as written by the toggle (jsdom would drop a Secure
// cookie on http, so the setter is watched instead).
function watchCookie() {
  const written: string[] = [];
  Object.defineProperty(document, "cookie", { configurable: true, get: () => "", set: (v: string) => written.push(v) });
  return written;
}

afterEach(() => {
  cleanup();
  delete (document as { cookie?: string }).cookie;
});

describe("TimelineViews (List · Calendar)", () => {
  it("cookie=calendar: the server's HTML is already the calendar (no swap after hydration)", () => {
    const html = renderToString(views(parseView("calendar")));
    expect(html).toContain('data-testid="the-calendar"');
    expect(html).not.toContain('data-testid="the-list"');
    expect(renderToString(views(parseView(undefined)))).toContain('data-testid="the-list"');
  });

  it("List by default; choosing Calendar switches and writes the cookie", () => {
    const written = watchCookie();
    render(views("list"));
    expect(screen.getByTestId("the-list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.timelineViewList })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: t.timelineViewCalendar }));
    expect(screen.getByTestId("the-calendar")).toBeInTheDocument();
    expect(screen.queryByTestId("the-list")).toBeNull();
    expect(written).toEqual([viewCookie("calendar")]);
  });

  it("the selected one is the rose segment", () => {
    render(views("calendar"));
    expect(screen.getByRole("button", { name: t.timelineViewCalendar }).className).toContain("bg-accent");
    expect(screen.getByRole("button", { name: t.timelineViewList }).className).not.toContain("bg-accent");
  });
});

describe("the timeline-view cookie", () => {
  it("only list or calendar; anything else is List", () => {
    expect(parseView("calendar")).toBe("calendar");
    expect(parseView("list")).toBe("list");
    expect(parseView("<script>")).toBe("list");
    expect(parseView(undefined)).toBe("list");
  });

  it("first-party, whole site, Lax, Secure, a year", () => {
    expect(viewCookie("calendar")).toBe("timeline-view=calendar; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });
});
