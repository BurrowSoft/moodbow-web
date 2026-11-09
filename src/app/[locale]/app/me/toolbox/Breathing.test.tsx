import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { Breathing } from "./Breathing";

const m = messages.toolbox;
let reduced = false;
beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce") && reduced, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const open = (onClose = vi.fn()) => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Breathing onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
};
const seconds = (n: number) => act(() => vi.advanceTimersByTime(n * 1000));

describe("Breathing", () => {
  it("in for 4, out for 6; the phase is said once per change, never every second", async () => {
    open();
    expect(screen.getByRole("dialog")).toHaveAccessibleName(m.breathTitle);
    expect(screen.getByTestId("breathing-phase")).toHaveTextContent(m.breatheIn);
    await seconds(3);
    expect(screen.getByTestId("breathing-phase")).toHaveTextContent(m.breatheIn);
    await seconds(1);
    expect(screen.getByTestId("breathing-phase")).toHaveTextContent(m.breatheOut);
    expect(screen.getByTestId("breathing-circle")).toHaveAttribute("data-phase", "out");
    await seconds(6);
    expect(screen.getByTestId("breathing-phase")).toHaveTextContent(m.breatheIn);
  });

  it("with reduced motion: no circle, the words count down", async () => {
    reduced = true;
    open();
    expect(screen.queryByTestId("breathing-circle")).toBeNull();
    expect(screen.getByTestId("breathing-count")).toHaveTextContent("Breathe in · 4");
    await seconds(1);
    expect(screen.getByTestId("breathing-count")).toHaveTextContent("Breathe in · 3");
    await seconds(3);
    expect(screen.getByTestId("breathing-count")).toHaveTextContent("Breathe out · 6");
  });

  it("Stop is there the whole minute, and stops it", async () => {
    const onClose = open();
    for (let s = 0; s < 59; s += 10) {
      expect(screen.getByTestId("breathing-stop"), `${s} s`).toHaveTextContent(m.stop);
      await seconds(10);
    }
    fireEvent.click(screen.getByTestId("breathing-stop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ends on its own after a minute, with its line and Done", async () => {
    const onClose = open();
    await seconds(59);
    expect(screen.queryByTestId("breathing-end")).toBeNull();
    await seconds(1);
    expect(screen.getByTestId("breathing-end")).toHaveTextContent(m.breathEnd);
    expect(screen.queryByTestId("breathing-stop")).toBeNull();
    // Nothing more happens after the end.
    await seconds(30);
    fireEvent.click(screen.getByTestId("breathing-done"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
