import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FOLD_MS } from "@/lib/ui/fold";
import { Fold } from "./Fold";

// The entry editor's folding rows (board 31b, 25 Nov). What the classes do in a browser, the 250 ms
// easeOutCubic and reduced motion included, is e2e/fold.spec.ts; here, what the component sets.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const row = (folded: boolean, inline = false) => (
  <Fold folded={folded} inline={inline} testId="fold">
    <button type="button">Inside</button>
  </Fold>
);
const inner = () => screen.getByTestId("fold").firstElementChild!;

describe("Fold", () => {
  it("open: in reach, and nothing clipped, so a focus ring shows whole", () => {
    render(row(false));
    expect(screen.getByTestId("fold")).toHaveAttribute("data-folded", "false");
    expect(screen.getByTestId("fold")).not.toHaveAttribute("inert");
    expect(screen.getByTestId("fold")).toHaveClass("grid", "grid-rows-[1fr]", "opacity-100");
    expect(inner()).not.toHaveClass("overflow-hidden");
  });

  it("folded: out of reach (inert), hidden at the end, its gap given back, its content clipped", () => {
    render(row(true));
    expect(screen.getByTestId("fold")).toHaveAttribute("data-folded", "true");
    expect(screen.getByTestId("fold")).toHaveAttribute("inert");
    expect(screen.getByTestId("fold")).toHaveClass("grid-rows-[0fr]", "opacity-0", "invisible", "-mt-4");
    expect(inner()).toHaveClass("overflow-hidden");
  });

  it("clipped while it moves either way; opened, unclipped a fold's time later", () => {
    vi.useFakeTimers();
    const { rerender } = render(row(false));
    rerender(row(true));
    expect(inner()).toHaveClass("overflow-hidden");
    rerender(row(false));
    expect(screen.getByTestId("fold")).not.toHaveAttribute("inert");
    expect(inner()).toHaveClass("overflow-hidden");
    act(() => vi.advanceTimersByTime(FOLD_MS - 1));
    expect(inner()).toHaveClass("overflow-hidden");
    act(() => vi.advanceTimersByTime(1));
    expect(inner()).not.toHaveClass("overflow-hidden");
  });

  it("inline, in a line of text: spans (valid in a <p>), and no gap to give back", () => {
    render(<p>{row(true, true)}</p>);
    expect(screen.getByTestId("fold").tagName).toBe("SPAN");
    expect(inner().tagName).toBe("SPAN");
    expect(screen.getByTestId("fold")).toHaveClass("inline-grid", "grid-rows-[0fr]");
    expect(screen.getByTestId("fold")).not.toHaveClass("-mt-4");
  });

  it("with reduced motion, no transition at all", () => {
    render(row(false));
    expect(screen.getByTestId("fold")).toHaveClass("motion-reduce:transition-none");
  });
});
