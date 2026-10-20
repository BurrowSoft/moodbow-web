import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// The sheet itself is ShareMonth's (tested there); here, a stand-in that
// shows what it was given and calls onOpen like the real one.
vi.mock("./insights/ShareMonth", () => ({
  ShareMonth: (p: { initialType?: string; milestone?: { n: number }; onOpen?: () => void; testId?: string }) => (
    <button type="button" data-testid={p.testId} data-type={p.initialType} data-n={p.milestone?.n} onClick={() => p.onOpen?.()} />
  ),
}));
const { MilestoneCard } = await import("./MilestoneCard");

const UID = "11111111-1111-1111-1111-111111111111";
const KEY = `mb:milestone-seen:${UID}:30`;
const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MilestoneCard n={30} colours={["#000000"]} uid={UID} month="2026-10" dateLocaleTag="en-US" />
    </NextIntlClientProvider>,
  );

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("MilestoneCard (decision 169)", () => {
  it("not yet seen: the title and the share trigger, opening on the milestone card", () => {
    renderIt();
    expect(screen.getByTestId("milestone-card")).toHaveTextContent("30 days of your story");
    const share = screen.getByTestId("milestone-share");
    expect(share).toHaveAttribute("data-type", "milestone");
    expect(share).toHaveAttribute("data-n", "30");
  });

  it("'Not now' hides it and remembers, for that person and milestone", () => {
    renderIt();
    fireEvent.click(screen.getByTestId("milestone-not-now"));
    expect(screen.queryByTestId("milestone-card")).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBe("1");
  });

  it("opening the sheet marks it seen, but the card stays while the sheet is open", () => {
    renderIt();
    fireEvent.click(screen.getByTestId("milestone-share"));
    expect(window.localStorage.getItem(KEY)).toBe("1");
    expect(screen.getByTestId("milestone-card")).toBeInTheDocument();
  });

  it("already seen: nothing shown; another milestone or person still is", () => {
    window.localStorage.setItem(KEY, "1");
    renderIt();
    expect(screen.queryByTestId("milestone-card")).toBeNull();
    cleanup();
    window.localStorage.setItem(`mb:milestone-seen:${UID}:100`, "1");
    window.localStorage.removeItem(KEY);
    renderIt();
    expect(screen.getByTestId("milestone-card")).toBeInTheDocument();
  });
});
