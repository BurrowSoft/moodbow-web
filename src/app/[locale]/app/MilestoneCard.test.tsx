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

  it("decision 186: fixed above the tab bar (out of the flow), a spacer keeps the page's end reachable, announced once politely", () => {
    renderIt();
    expect(screen.getByTestId("milestone-card").className).toMatch(/\bfixed\b/);
    expect(screen.getByTestId("milestone-card").className).toMatch(/\bmilestone-in\b/);
    // Room at the page's very end (after the footer) while it floats.
    expect(document.body).toHaveClass("has-floating-card");
    expect(screen.getByRole("status")).toHaveTextContent("30 days of your story");
  });

  it("✕ is Not now by name, and does the same", () => {
    renderIt();
    // Two controls named "Not now": the ✕ and the text button.
    expect(screen.getAllByRole("button", { name: messages.share.milestoneNotNow })).toHaveLength(2);
    fireEvent.click(screen.getByTestId("milestone-close"));
    expect(screen.queryByTestId("milestone-card")).toBeNull();
    expect(document.body).not.toHaveClass("has-floating-card");
    expect(window.localStorage.getItem(KEY)).toBe("1");
    // The live region stays (empty), so it's never re-announced.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
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

  it("seen on an earlier visit: no card and no extra room at the page's end", () => {
    window.localStorage.setItem(KEY, "1");
    renderIt();
    expect(screen.queryByTestId("milestone-card")).toBeNull();
    expect(document.body).not.toHaveClass("has-floating-card");
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
