import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { SlowLoading } from "./SlowLoading";

const renderIt = (active?: boolean) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SlowLoading active={active} />
    </NextIntlClientProvider>,
  );

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SlowLoading (UX: after 3 s)", () => {
  it("says nothing before 3 s, then 'Taking longer than usual…'", () => {
    renderIt();
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByTestId("slow-loading")).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toHaveTextContent(messages.app.slowLoading);
  });

  it("inactive (Try again not pressed): never", () => {
    renderIt(false);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByTestId("slow-loading")).toBeEmptyDOMElement();
  });

  it("starts over each time it becomes active", () => {
    const view = renderIt(true);
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId("slow-loading")).not.toBeEmptyDOMElement();
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SlowLoading active={false} />
      </NextIntlClientProvider>,
    );
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SlowLoading active />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("slow-loading")).toBeEmptyDOMElement();
  });
});
