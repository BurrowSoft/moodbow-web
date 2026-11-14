import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { CHECKIN_SAVED_EVENT } from "@/lib/journal/checkInSaved";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
import { SETUP_LATER_KEY } from "@/lib/journal/setupLater";
const { SetupLaterCard, TodayPlusCard } = await import("./TodayCards");
const wrap = (ui: ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("TodayPlusCard (1.3 §6)", () => {
  it("Me's card, on Today: the offer, its button to the Plus screen, and Close", () => {
    wrap(<TodayPlusCard trial price="US$59.99" date="2026-12-10" />);
    expect(screen.getByTestId("today-plus-card")).toHaveTextContent(messages.plus.bannerTitle);
    expect(screen.getByTestId("today-plus-try")).toHaveAttribute("href", "/app/me/plus");
    fireEvent.click(screen.getByTestId("today-plus-card-close"));
    expect(screen.queryByTestId("today-plus-card")).toBeNull();
  });
  it("a check-in saved here with one of the two lowest faces: gone at once; a good one keeps it", () => {
    wrap(<TodayPlusCard trial price="US$59.99" date="2026-12-10" />);
    act(() => void window.dispatchEvent(new CustomEvent(CHECKIN_SAVED_EVENT, { detail: { date: "2026-12-10", mood: 4 } })));
    expect(screen.getByTestId("today-plus-card")).toBeInTheDocument();
    act(() => void window.dispatchEvent(new CustomEvent(CHECKIN_SAVED_EVENT, { detail: { date: "2026-12-10", mood: 2 } })));
    expect(screen.queryByTestId("today-plus-card")).toBeNull();
  });
});

describe("SetupLaterCard (1.3 §6)", () => {
  it("offers Setup; Not now hides it for good on this device", () => {
    wrap(<SetupLaterCard />);
    expect(screen.getByTestId("today-setup-later-open")).toHaveAttribute("href", "/setup");
    fireEvent.click(screen.getByTestId("today-setup-later-close"));
    expect(screen.queryByTestId("today-setup-later")).toBeNull();
    expect(window.localStorage.getItem(SETUP_LATER_KEY)).toBe("1");
    cleanup();
    wrap(<SetupLaterCard />);
    expect(screen.queryByTestId("today-setup-later")).toBeNull();
  });
});

describe("TodayPlusCard in December: the compact Christmas look (board 21b)", () => {
  it("the gold tag, the first year, the short small print with where to cancel; no body", () => {
    wrap(<TodayPlusCard trial price="€49.99" offer={{ firstYear: "€24.99", price: "€49.99" }} date="2026-12-10" />);
    const card = screen.getByTestId("today-plus-card");
    expect(card).toHaveAttribute("data-offer", "");
    expect(card).toHaveTextContent(messages.plus.offerLabel);
    expect(card).toHaveTextContent("Your first year for €24.99");
    expect(card).toHaveTextContent("Until 31 December. Then €49.99 a year. Cancel anytime in Me → Moodbow Plus.");
    expect(card).not.toHaveTextContent(messages.plus.offerBannerBody);
  });
});
