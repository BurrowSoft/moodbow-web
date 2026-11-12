import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { localKey } from "@/lib/localData";
import { publishTodayMood, resetTodayMood } from "@/lib/journal/todayMood";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { ToolboxCard } = await import("./ToolboxCard");

const m = messages.toolbox;
const TODAY = "2026-11-09";
const items = [
  { id: "a", text: "Walk round the block", position: 0 },
  { id: "b", text: "Text Sam", position: 1 },
];
beforeEach(() => {
  window.localStorage.clear();
  resetTodayMood();
});
afterEach(cleanup);

const card = (todayMood: number | null, list = items) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ToolboxCard uid="u1" today={TODAY} todayMood={todayMood} items={list} />
    </NextIntlClientProvider>,
  );

describe("ToolboxCard", () => {
  it("after a low check-in today: their things, and a minute to breathe", () => {
    card(2);
    expect(screen.getByTestId("toolbox-card")).toHaveTextContent(m.cardTitle);
    expect(screen.getByTestId("toolbox-card-items")).toHaveTextContent("Walk round the block");
    expect(screen.getByTestId("toolbox-card-items")).toHaveTextContent("Text Sam");
    fireEvent.click(screen.getByTestId("toolbox-card-breathe"));
    expect(screen.getByTestId("breathing")).toBeInTheDocument();
  });

  it("no check-in today, or not a low one: no card", () => {
    for (const mood of [null, 3, 4, 5]) {
      card(mood);
      expect(screen.queryByTestId("toolbox-card"), String(mood)).toBeNull();
      cleanup();
    }
  });

  it("follows the check-in saved here: a low one brings it, a later better one takes it away", () => {
    card(4);
    expect(screen.queryByTestId("toolbox-card")).toBeNull();
    act(() => publishTodayMood(TODAY, 1));
    expect(screen.getByTestId("toolbox-card")).toBeInTheDocument();
    act(() => publishTodayMood(TODAY, 3));
    expect(screen.queryByTestId("toolbox-card")).toBeNull();
    // Another day's save (a day page) isn't today's.
    act(() => publishTodayMood("2026-11-01", 1));
    expect(screen.queryByTestId("toolbox-card")).toBeNull();
  });

  it("an empty list: a way to add one, and breathing still", () => {
    card(1, []);
    expect(screen.getByTestId("toolbox-card-add")).toHaveAttribute("href", "/app/me/toolbox");
    expect(screen.getByTestId("toolbox-card-add")).toHaveTextContent(m.cardEmpty);
    expect(screen.getByTestId("toolbox-card-breathe")).toBeInTheDocument();
  });

  it("Not now hides it for today, in this browser, and focus goes to Today's heading", () => {
    const heading = document.createElement("h1");
    heading.id = "today-title";
    heading.tabIndex = -1;
    document.body.append(heading);
    card(1);
    fireEvent.click(screen.getByTestId("toolbox-card-not-now"));
    expect(screen.queryByTestId("toolbox-card")).toBeNull();
    expect(window.localStorage.getItem(localKey("toolbox-card-hidden", "u1", TODAY))).toBe("1");
    expect(heading).toHaveFocus();
    cleanup();
    card(1);
    expect(screen.queryByTestId("toolbox-card")).toBeNull();
    heading.remove();
  });
});

describe("ToolboxCard: the list couldn't be read (UX)", () => {
  it("a minute to breathe still, with no items and no offer to add", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ToolboxCard uid="u1" today={TODAY} todayMood={1} items={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("toolbox-card-breathe")).toHaveTextContent(m.breathe);
    expect(screen.queryByTestId("toolbox-card-items")).toBeNull();
    expect(screen.queryByTestId("toolbox-card-add")).toBeNull();
    fireEvent.click(screen.getByTestId("toolbox-card-breathe"));
    expect(screen.getByTestId("breathing")).toBeInTheDocument();
  });
});
