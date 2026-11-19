import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { patternById, type BreathingPattern } from "@/lib/journal/toolbox";
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

const open = (onClose = vi.fn(), pattern?: BreathingPattern) => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Breathing onClose={onClose} pattern={pattern} />
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
    for (let s = 0; s < 54; s += 9) {
      expect(screen.getByTestId("breathing-stop"), `${s} s`).toHaveTextContent(m.stop);
      await seconds(9);
    }
    // 54 s in: still breathing, Stop still there.
    fireEvent.click(screen.getByTestId("breathing-stop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // A plain safety line while it runs (UX, 12 Nov), in the free toolbox too.
  it("the dizzy line is there while it runs, and goes at the end", async () => {
    open();
    expect(screen.getByTestId("breathing-safety")).toHaveTextContent(m.breathSafety);
    await seconds(30);
    expect(screen.getByTestId("breathing-safety")).toHaveTextContent(m.breathSafety);
    await seconds(30);
    expect(screen.getByTestId("breathing-end")).toBeInTheDocument();
    expect(screen.queryByTestId("breathing-safety")).toBeNull();
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

  // Plus's Box (specs/plus-breathing-draft.md): 4 in, 4 hold, 4 out, 4 hold, four times.
  it("Box: a hold says Hold, and the circle keeps the size the breath left it at", async () => {
    open(vi.fn(), patternById("box")!);
    const circle = () => screen.getByTestId("breathing-circle");
    await seconds(3);
    const afterIn = circle().style.transform;
    await seconds(1);
    expect(screen.getByTestId("breathing-phase")).toHaveTextContent(m.breatheHold);
    expect(circle()).toHaveAttribute("data-phase", "hold");
    expect(circle().style.transform, "held where breathing in left it").toBe(afterIn);
    await seconds(4);
    expect(screen.getByTestId("breathing-phase")).toHaveTextContent(m.breatheOut);
    await seconds(3);
    const afterOut = circle().style.transform;
    expect(afterOut).toBe("scale(0.55)");
    await seconds(1);
    expect(circle()).toHaveAttribute("data-phase", "hold");
    expect(circle().style.transform, "held where breathing out left it").toBe(afterOut);
    expect(screen.getByTestId("breathing-safety")).toHaveTextContent(m.breathSafety);
  });

  it("Box with reduced motion: the hold counts down in words too", async () => {
    reduced = true;
    open(vi.fn(), patternById("box")!);
    await seconds(4);
    expect(screen.getByTestId("breathing-count")).toHaveTextContent("Hold · 4");
    await seconds(3);
    expect(screen.getByTestId("breathing-count")).toHaveTextContent("Hold · 1");
  });

  it("Box ends after its four whole cycles, 64 s", async () => {
    open(vi.fn(), patternById("box")!);
    await seconds(63);
    expect(screen.queryByTestId("breathing-end")).toBeNull();
    await seconds(1);
    expect(screen.getByTestId("breathing-end")).toHaveTextContent(m.breathEnd);
  });
});
