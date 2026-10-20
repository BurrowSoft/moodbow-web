import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
const searchEntries = vi.fn();
vi.mock("./searchActions", () => ({ searchEntries: (...a: unknown[]) => searchEntries(...a) }));
const { TimelineSearch } = await import("./TimelineSearch");

const t = messages.timeline;
const hit = (n: number, over: object = {}) => ({ id: `e${n}`, date: "2026-10-20", isMoment: false, mood: 4, snippet: { before: "A long ", match: "walk", after: " by the river." }, ...over });
const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimelineSearch dateLocaleTag="en-GB">
        <p data-testid="the-list" />
      </TimelineSearch>
    </NextIntlClientProvider>,
  );
const open = () => fireEvent.click(screen.getByRole("button", { name: t.searchOpen }));
const type = (text: string) => fireEvent.change(screen.getByRole("searchbox", { name: t.searchLabel }), { target: { value: text } });
const wait = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  searchEntries.mockReset().mockResolvedValue({ status: "ok", hits: [hit(1)], more: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TimelineSearch (1.1 L)", () => {
  it("closed: the magnifier and the list; open: the labelled field, focused, with the hint, and no list", () => {
    renderIt();
    expect(screen.getByTestId("the-list")).toBeInTheDocument();
    open();
    expect(screen.queryByTestId("the-list")).toBeNull();
    expect(screen.getByRole("searchbox", { name: t.searchLabel })).toHaveFocus();
    expect(screen.getByTestId("timeline-search-status")).toHaveTextContent(t.searchHint);
  });

  it("debounced 300 ms, from 2 characters: one request for the last text", async () => {
    renderIt();
    open();
    type("w");
    await wait(400);
    expect(searchEntries).not.toHaveBeenCalled();
    type("wa");
    await wait(100);
    type("walk");
    await wait(299);
    expect(searchEntries).not.toHaveBeenCalled();
    await wait(1);
    expect(searchEntries).toHaveBeenCalledTimes(1);
    expect(searchEntries).toHaveBeenCalledWith("walk");
  });

  it("results: a row per hit to the entry, date · mood, the match in bold, and the count", async () => {
    searchEntries.mockResolvedValueOnce({ status: "ok", hits: [hit(1, { isMoment: true }), hit(2, { mood: null })], more: false });
    renderIt();
    open();
    type("walk");
    await wait(300);
    const first = screen.getByTestId("timeline-search-hit-e1");
    expect(first).toHaveAttribute("href", expect.stringContaining("/app/entries/e1"));
    expect(first).toHaveTextContent(messages.today.mood4);
    expect(first.querySelector("strong")).toHaveTextContent("walk");
    expect(screen.getByTestId("timeline-search-hit-e2")).not.toHaveTextContent(messages.today.mood4);
    expect(screen.getByTestId("timeline-search-status")).toHaveTextContent("2 entries");
    expect(screen.queryByTestId("timeline-search-more")).toBeNull();
  });

  it("nothing found: the empty line with the text; more than 50: 'Showing the newest 50.'", async () => {
    searchEntries.mockResolvedValueOnce({ status: "ok", hits: [], more: false }).mockResolvedValueOnce({ status: "ok", hits: [hit(1)], more: true });
    renderIt();
    open();
    type("zzqx");
    await wait(300);
    expect(screen.getByTestId("timeline-search-status")).toHaveTextContent('Nothing found for "zzqx".');
    type("walk");
    await wait(300);
    expect(screen.getByTestId("timeline-search-more")).toHaveTextContent(t.searchMore);
  });

  it("an older answer arriving late is ignored", async () => {
    let slow!: (v: unknown) => void;
    searchEntries.mockReturnValueOnce(new Promise((r) => (slow = r))).mockResolvedValueOnce({ status: "ok", hits: [], more: false });
    renderIt();
    open();
    type("wa");
    await wait(300);
    type("zzqx");
    await wait(300);
    await act(async () => slow({ status: "ok", hits: [hit(1)], more: false }));
    expect(screen.queryByTestId("timeline-search-results")).toBeNull();
    expect(screen.getByTestId("timeline-search-status")).toHaveTextContent('Nothing found for "zzqx".');
  });

  it("Esc closes: the list is back, the text is gone, focus on the magnifier; ✕ does the same", async () => {
    renderIt();
    open();
    type("walk");
    fireEvent.keyDown(screen.getByRole("searchbox", { name: t.searchLabel }), { key: "Escape" });
    await wait(300);
    expect(screen.getByTestId("the-list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.searchOpen })).toHaveFocus();
    expect(searchEntries).not.toHaveBeenCalled();
    open();
    expect(screen.getByRole("searchbox", { name: t.searchLabel })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: t.searchClose }));
    await wait(0);
    expect(screen.getByTestId("the-list")).toBeInTheDocument();
  });

  it("an error: the error text and a Try again button that asks again for the same text", async () => {
    searchEntries.mockResolvedValueOnce({ status: "error" });
    renderIt();
    open();
    type("walk");
    await wait(300);
    expect(screen.getByRole("alert")).toHaveTextContent(messages.today.errGeneric);
    fireEvent.click(screen.getByRole("button", { name: messages.app.tryAgain }));
    await wait(0);
    expect(searchEntries).toHaveBeenCalledTimes(2);
    expect(searchEntries).toHaveBeenLastCalledWith("walk");
    expect(screen.getByTestId("timeline-search-hit-e1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offline: errOffline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    searchEntries.mockRejectedValueOnce(new Error("Failed to fetch"));
    renderIt();
    open();
    type("walk");
    await wait(300);
    expect(screen.getByRole("alert")).toHaveTextContent(messages.ai.errOffline);
    // Back to jsdom's own (on the prototype).
    delete (navigator as { onLine?: boolean }).onLine;
  });
});
