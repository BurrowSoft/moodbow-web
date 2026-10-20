import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { OnThisDay } = await import("./OnThisDay");

const t = messages.timeline;
type Props = Parameters<typeof OnThisDay>[0];
const BASE: Props = { kind: "year", entryId: "e1", dateLabel: "Tuesday, October 21, 2025", preview: "Sunrise swim with Maya.", mood: 5, uid: "u1", today: "2026-10-21" };
const renderCard = (over: Partial<Props> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OnThisDay {...BASE} {...over} />
    </NextIntlClientProvider>,
  );

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("OnThisDay (1.1 A)", () => {
  it("names how long ago, then the day's mood, the date and two lines; opens the entry from the Timeline", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: t.onThisDayYear })).toBeInTheDocument();
    const link = screen.getByTestId("on-this-day-entry");
    expect(link).toHaveAttribute("href", "/app/entries/e1?from=%2Fapp%2Ftimeline");
    expect(link).toHaveTextContent("Tuesday, October 21, 2025");
    expect(link.querySelector(".line-clamp-2")).toHaveTextContent("Sunrise swim with Maya.");
    expect(link.querySelector("[aria-hidden=true].rounded-full")).not.toBeNull();
  });

  it("each kind has its own words; no dot without a check-in that day", () => {
    renderCard({ kind: "sixMonths", mood: null });
    expect(screen.getByRole("heading", { name: t.onThisDay6Months })).toBeInTheDocument();
    expect(screen.getByTestId("on-this-day-entry").querySelector(".rounded-full")).toBeNull();
    cleanup();
    renderCard({ kind: "month" });
    expect(screen.getByRole("heading", { name: t.onThisDayMonth })).toBeInTheDocument();
  });

  it("✕ hides it for today; a new day shows it again", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: t.onThisDayDismiss }));
    expect(screen.queryByTestId("on-this-day")).toBeNull();
    cleanup();
    renderCard();
    expect(screen.queryByTestId("on-this-day")).toBeNull();
    cleanup();
    renderCard({ today: "2026-10-22" });
    expect(screen.getByTestId("on-this-day")).toBeInTheDocument();
  });
});
