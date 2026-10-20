import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { CalendarMonth } from "@/lib/journal/calendar";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const loadCalendarMonth = vi.fn();
vi.mock("./calendarActions", () => ({ loadCalendarMonth: (...a: unknown[]) => loadCalendarMonth(...a) }));
vi.mock("../insights/ShareMonth", () => ({ ShareMonth: ({ month, testId }: { month: string; testId: string }) => <span data-testid={testId} data-month={month} /> }));
const { MonthCalendar } = await import("./MonthCalendar");

const t = messages.timeline;
const TODAY = "2026-10-21";
const OCTOBER: CalendarMonth = {
  "2026-10-01": { mood: 4, moment: false, entry: true },
  "2026-10-02": { mood: null, moment: true, entry: true },
  "2026-10-20": { mood: 2, moment: false, entry: false },
};
const renderIt = (initial: CalendarMonth | null = OCTOBER, shareable = true, printable = false) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MonthCalendar today={TODAY} dateLocaleTag="en-GB" initial={initial} shareable={shareable} printable={printable} />
    </NextIntlClientProvider>,
  );
const day = (date: string) => screen.getByTestId(`calendar-day-${date}`);
// A month is asked for on the next tick; then its answer settles.
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = () =>
  act(async () => {
    await tick();
    await tick();
  });

beforeEach(() => {
  loadCalendarMonth.mockReset().mockResolvedValue({ status: "ok", days: {} });
});
afterEach(cleanup);

describe("MonthCalendar (1.1 M)", () => {
  it("this month, weeks from Monday, the weekday names for screen readers", () => {
    renderIt();
    expect(screen.getByTestId("calendar-title")).toHaveTextContent("October 2026");
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(7);
    expect(headers[0]).toHaveAccessibleName("Monday");
    expect(screen.getByRole("grid")).toHaveAccessibleName("October 2026");
    expect(loadCalendarMonth).not.toHaveBeenCalled();
  });

  it("each day named in words: date, mood word, moment, entry (never colour alone)", () => {
    renderIt();
    expect(day("2026-10-01")).toHaveAccessibleName(`Thursday 1 October, ${messages.today.mood4}, entry`);
    expect(day("2026-10-02")).toHaveAccessibleName("Friday 2 October, moment, entry");
    expect(day("2026-10-03")).toHaveAccessibleName("Saturday 3 October");
    expect(day("2026-10-01").querySelector("[data-testid=calendar-dot]")).not.toBeNull();
    expect(day("2026-10-02").querySelector("[data-testid=calendar-dot]")).toBeNull();
    expect(day("2026-10-02").querySelector("[data-testid=calendar-moment]")).not.toBeNull();
    // No "missed" mark on a day with nothing.
    expect(day("2026-10-03").querySelectorAll("[data-testid^=calendar-]")).toHaveLength(0);
  });

  it("a day opens its day page; today is marked; the future isn't a link", () => {
    renderIt();
    expect(day("2026-10-01")).toHaveAttribute("href", "/app/timeline/2026-10-01");
    expect(day(TODAY).closest("[role=gridcell]")).toHaveAttribute("aria-current", "date");
    expect(day("2026-10-22").tagName).toBe("SPAN");
    expect(day("2026-10-22")).not.toHaveAttribute("href");
  });

  it("‹ the previous month (asked for), and no months after this one", async () => {
    loadCalendarMonth.mockResolvedValueOnce({ status: "ok", days: { "2026-09-30": { mood: 5, moment: false, entry: false } } });
    renderIt();
    expect(screen.getByRole("button", { name: t.calNextMonth })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: t.calPrevMonth }));
    await settle();
    expect(loadCalendarMonth).toHaveBeenCalledWith("2026-09");
    expect(screen.getByTestId("calendar-title")).toHaveTextContent("September 2026");
    expect(day("2026-09-30")).toHaveAccessibleName(`Wednesday 30 September, ${messages.today.mood5}`);
    expect(day("2026-09-30")).toHaveAttribute("href", "/app/timeline/2026-09-30");
    fireEvent.click(screen.getByRole("button", { name: t.calNextMonth }));
    expect(screen.getByTestId("calendar-title")).toHaveTextContent("October 2026");
    expect(loadCalendarMonth).toHaveBeenCalledTimes(1);
  });

  it("one tab stop (today); arrow keys move by day and week, not into the future, across months", async () => {
    renderIt();
    expect(day(TODAY)).toHaveAttribute("tabindex", "0");
    expect(day("2026-10-20")).toHaveAttribute("tabindex", "-1");
    const grid = screen.getByRole("grid");
    day(TODAY).focus();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(day(TODAY)).toHaveFocus();
    fireEvent.keyDown(grid, { key: "ArrowLeft" });
    expect(day("2026-10-20")).toHaveFocus();
    fireEvent.keyDown(grid, { key: "ArrowUp" });
    expect(day("2026-10-13")).toHaveFocus();
    fireEvent.keyDown(grid, { key: "ArrowUp" });
    fireEvent.keyDown(grid, { key: "ArrowUp" });
    await settle();
    expect(screen.getByTestId("calendar-title")).toHaveTextContent("September 2026");
    expect(day("2026-09-29")).toHaveFocus();
    expect(loadCalendarMonth).toHaveBeenCalledWith("2026-09");
  });

  it("Share this month: only with enough check-ins for a card", async () => {
    renderIt();
    expect(screen.queryByTestId("calendar-share")).toBeNull();
    cleanup();
    const five = Object.fromEntries([1, 2, 3, 4, 5].map((d) => [`2026-10-0${d}`, { mood: 3, moment: false, entry: false }]));
    renderIt(five);
    expect(screen.getByTestId("calendar-share")).toHaveAttribute("data-month", "2026-10");
    cleanup();
    renderIt(five, false);
    expect(screen.queryByTestId("calendar-share")).toBeNull();
  });

  it("Print this month under the calendar (1.1 N): only where printing is live, for the month shown", async () => {
    renderIt(OCTOBER, false);
    expect(screen.queryByTestId("calendar-print")).toBeNull();
    cleanup();
    renderIt(OCTOBER, false, true);
    expect(screen.getByTestId("calendar-print")).toHaveAttribute("href", "/app/print/2026-10");
    expect(screen.getByTestId("calendar-print")).toHaveTextContent(t.printMonth);
    fireEvent.click(screen.getByRole("button", { name: t.calPrevMonth }));
    await settle();
    expect(screen.getByTestId("calendar-print")).toHaveAttribute("href", "/app/print/2026-09");
  });

  it("a failed month: the error and a Try again that asks again", async () => {
    loadCalendarMonth.mockResolvedValueOnce({ status: "error" }).mockResolvedValueOnce({ status: "ok", days: {} });
    renderIt(null);
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent(messages.today.errGeneric);
    fireEvent.click(screen.getByRole("button", { name: messages.app.tryAgain }));
    await settle();
    expect(loadCalendarMonth).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
