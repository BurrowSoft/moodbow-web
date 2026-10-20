import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import messages from "@/messages/en.json";
import { TimelineViews, VIEW_KEY } from "./TimelineViews";

const t = messages.timeline;
const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimelineViews list={<p data-testid="the-list" />} calendar={<p data-testid="the-calendar" />} />
    </NextIntlClientProvider>,
  );

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("TimelineViews (List · Calendar)", () => {
  it("List by default; Calendar switches and is remembered on this device", () => {
    renderIt();
    expect(screen.getByTestId("the-list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.timelineViewList })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: t.timelineViewCalendar }));
    expect(screen.getByTestId("the-calendar")).toBeInTheDocument();
    expect(screen.queryByTestId("the-list")).toBeNull();
    expect(window.localStorage.getItem(VIEW_KEY)).toBe("calendar");
    cleanup();
    renderIt();
    expect(screen.getByTestId("the-calendar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.timelineViewCalendar })).toHaveAttribute("aria-pressed", "true");
  });

  it("the selected one is the rose segment", () => {
    renderIt();
    expect(screen.getByRole("button", { name: t.timelineViewList }).className).toContain("bg-accent");
    expect(screen.getByRole("button", { name: t.timelineViewCalendar }).className).not.toContain("bg-accent");
  });
});
