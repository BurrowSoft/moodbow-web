import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { wipeLocalData } from "@/lib/localData";

// Today's Year card (1.4 A, UX 19 Nov): a "New" label 1 to 7 December, before the title; Not now
// hides it for the rest of the season, per user (the year stays in Insights).
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { YearTodayCard, yearCardHiddenKey } = await import("./YearTodayCard");
const show = (props: { uid?: string; year?: number; isNew?: boolean } = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <YearTodayCard uid={props.uid ?? "u1"} year={props.year ?? 2026} query="" isNew={props.isNew} />
    </NextIntlClientProvider>,
  );
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("YearTodayCard", () => {
  it('"New" before the title, when asked; inside the heading so it\'s read first', () => {
    show({ isNew: true });
    expect(screen.getByTestId("year-today-new")).toHaveTextContent(messages.year.new);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(`${messages.year.new}${messages.year.title}`);
  });

  it("no label otherwise; Open goes to the year", () => {
    show();
    expect(screen.queryByTestId("year-today-new")).toBeNull();
    expect(screen.getByTestId("year-today-open")).toHaveAttribute("href", "/app/year");
  });

  it("Not now: gone for this season and this user only", () => {
    show();
    act(() => fireEvent.click(screen.getByTestId("year-today-not-now")));
    expect(screen.queryByTestId("year-today-card")).toBeNull();
    expect(window.localStorage.getItem(yearCardHiddenKey("u1", 2026))).toBe("1");
    cleanup();
    show();
    expect(screen.queryByTestId("year-today-card")).toBeNull();
    cleanup();
    // Another person on this browser, or next season: the card is there.
    show({ uid: "u2" });
    expect(screen.getByTestId("year-today-card")).toBeInTheDocument();
    cleanup();
    show({ year: 2027 });
    expect(screen.getByTestId("year-today-card")).toBeInTheDocument();
  });

  it("the mark is the user's: deleting the account removes it", () => {
    window.localStorage.setItem(yearCardHiddenKey("u1", 2026), "1");
    wipeLocalData(window.localStorage, "u1");
    expect(window.localStorage.getItem(yearCardHiddenKey("u1", 2026))).toBeNull();
  });
});
