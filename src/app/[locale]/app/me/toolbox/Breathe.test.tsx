import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { Breathe, PATTERN_KEY } from "./Breathe";

const m = messages.toolbox;
const show = (hasPlus: boolean) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Breathe hasPlus={hasPlus} />
    </NextIntlClientProvider>,
  );
beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The toolbox is a help surface (UX, 12 Nov): without Plus it's exactly today's.
describe("Breathe in the toolbox", () => {
  it("without Plus: today's button only, no choice, no lock, nothing about other patterns", () => {
    window.localStorage.setItem(PATTERN_KEY, "box");
    show(false);
    expect(screen.getByTestId("toolbox-breathe")).toHaveTextContent(m.breathe);
    expect(screen.getByTestId("toolbox-breathe")).toHaveAttribute("data-pattern", "even-4-6");
    expect(screen.queryByTestId("toolbox-patterns")).toBeNull();
    expect(document.querySelector("[data-locked]")).toBeNull();
    expect(screen.queryByText(m.patternBox)).toBeNull();
    expect(screen.queryByText(messages.plus.lock)).toBeNull();
  });

  it("with Plus: the three ways to breathe, today's first and chosen; a choice is kept and the button starts it", () => {
    show(true);
    expect(screen.getByRole("group", { name: m.breathePatterns })).toBeInTheDocument();
    expect(screen.getByTestId("toolbox-pattern-even-4-6")).toBeChecked();
    expect(screen.getByText(m.patternBoxSteps)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("toolbox-pattern-box"));
    expect(window.localStorage.getItem(PATTERN_KEY)).toBe("box");
    expect(screen.getByTestId("toolbox-breathe")).toHaveAttribute("data-pattern", "box");
    fireEvent.click(screen.getByTestId("toolbox-breathe"));
    expect(screen.getByTestId("breathing")).toBeInTheDocument();
  });

  it("with Plus, the kept one comes back; anything unknown is today's", () => {
    window.localStorage.setItem(PATTERN_KEY, "even-5");
    show(true);
    expect(screen.getByTestId("toolbox-pattern-even-5")).toBeChecked();
    cleanup();
    window.localStorage.setItem(PATTERN_KEY, "4-7-8");
    show(true);
    expect(screen.getByTestId("toolbox-pattern-even-4-6")).toBeChecked();
  });
});
