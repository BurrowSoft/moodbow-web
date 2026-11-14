import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { SAVE_WAIT_MS } from "@/lib/ui/withTimeout";
import type { PlusView } from "@/lib/plus/view";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { PlusInMe } = await import("./PlusInMe");
const m = messages.plus;

const show = (view: PlusView) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PlusInMe view={view} price="US$59.99" />
    </NextIntlClientProvider>,
  );
beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PlusInMe: the banner", () => {
  it("free: See the bigger picture, Try 7 days free to the Plus screen, then the price", () => {
    show({ kind: "free", trial: true });
    const banner = screen.getByTestId("me-plus-banner");
    expect(banner).toHaveTextContent(m.bannerTitle);
    expect(screen.getByTestId("me-plus-try")).toHaveAttribute("href", "/app/me/plus");
    expect(screen.getByTestId("me-plus-try")).toHaveTextContent(m.tryFree);
    expect(banner).toHaveTextContent("Then US$59.99 a year");
  });

  it("the free week used: See Plus and the yearly price", () => {
    show({ kind: "free", trial: false });
    expect(screen.getByTestId("me-plus-try")).toHaveTextContent(m.seePlus);
    expect(screen.getByTestId("me-plus-banner")).toHaveTextContent("US$59.99 a year");
  });

  it("closed: gone for the rest of that day only; back the next day", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 11, 9, 0));
    show({ kind: "free", trial: true });
    act(() => fireEvent.click(screen.getByRole("button", { name: m.bannerClose })));
    expect(screen.queryByTestId("me-plus-banner")).toBeNull();
    cleanup();
    vi.setSystemTime(new Date(2026, 10, 11, 23, 0));
    show({ kind: "free", trial: true });
    expect(screen.queryByTestId("me-plus-banner")).toBeNull();
    cleanup();
    vi.setSystemTime(new Date(2026, 10, 12, 8, 0));
    show({ kind: "free", trial: true });
    expect(screen.getByTestId("me-plus-banner")).toBeInTheDocument();
  });
});

describe("PlusInMe: the trial counter and a failed renewal", () => {
  it("the free week: Plus trial, n days left, 7 segments named by the day", () => {
    show({ kind: "plus", source: "stripe", daysLeft: 5 });
    expect(screen.getByTestId("me-plus-days-left")).toHaveTextContent("5 days left");
    expect(screen.getByRole("img", { name: "Day 3 of 7" })).toBeInTheDocument();
    expect(screen.queryByTestId("me-plus-banner")).toBeNull();
  });
  it("one day left: singular", () => {
    show({ kind: "plus", source: "play", daysLeft: 1 });
    expect(screen.getByTestId("me-plus-days-left")).toHaveTextContent("1 day left");
  });
  it("Plus with no trial running: nothing here", () => {
    const { container } = show({ kind: "plus", source: "stripe", daysLeft: null });
    expect(container).toBeEmptyDOMElement();
  });
  it("past_due, a dead connection: Update card gives up at SAVE_WAIT_MS with the error line and works again (audit D)", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn(async () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")));
    vi.stubGlobal("fetch", fetchMock);
    show({ kind: "past_due" });
    await act(async () => fireEvent.click(screen.getByTestId("me-plus-update-card")));
    expect(fetchMock).toHaveBeenCalledWith("/api/billing/portal", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(timeout).toHaveBeenCalledWith(SAVE_WAIT_MS);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("me-plus-update-card")).not.toBeDisabled();
    timeout.mockRestore();
    vi.unstubAllGlobals();
  });

  it("past_due: the state line and Update card, no offer", () => {
    show({ kind: "past_due" });
    expect(screen.getByTestId("me-plus-past-due")).toHaveTextContent(m.pastDue);
    expect(screen.getByTestId("me-plus-update-card")).toHaveTextContent(m.updateCard);
    expect(screen.queryByTestId("me-plus-banner")).toBeNull();
  });
});

describe("PlusInMe: the Christmas offer's banner (1.3)", () => {
  it("its label, the first year, See the offer, and the renewal in the small print", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PlusInMe view={{ kind: "free", trial: true }} price="€49.99" offer={{ firstYear: "€24.99", price: "€49.99" }} />
      </NextIntlClientProvider>,
    );
    const banner = screen.getByTestId("me-plus-banner");
    expect(banner).toHaveAttribute("data-offer", "");
    expect(banner).toHaveTextContent(m.offerLabel);
    expect(banner).toHaveTextContent("Your first year for €24.99");
    expect(screen.getByTestId("me-plus-try")).toHaveTextContent(m.offerSee);
    expect(banner).toHaveTextContent("Christmas special, until 31 December. Then €49.99 a year. Cancel anytime in Me → Moodbow Plus.");
    expect(banner.textContent).not.toMatch(/%|half|7 days/i);
  });
});
