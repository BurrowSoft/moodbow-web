import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { RecallMonth } from "@/lib/journal/momentRecall";

const setMomentRecall = vi.fn();
vi.mock("../actions", () => ({ setMomentRecall: (...a: unknown[]) => setMomentRecall(...a) }));
const { RecallChips } = await import("./RecallChips");
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({ start }: { start: RecallMonth[] }) {
  const [value, setValue] = useState(start);
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <RecallChips id="e1" value={value} onChange={setValue} />
    </NextIntlClientProvider>
  );
}

describe("RecallChips (Memories, 034)", () => {
  it("all on by default; a tap saves the new set; what the server stored is shown", async () => {
    setMomentRecall.mockResolvedValue({ status: "ok", months: [1, 12] });
    render(<Harness start={[1, 6, 12]} />);
    expect(screen.getByTestId("entry-recall")).toHaveTextContent(messages.entry.recallIn);
    for (const m of [1, 6, 12]) expect(screen.getByTestId(`entry-recall-${m}`)).toHaveAttribute("aria-pressed", "true");
    await act(async () => fireEvent.click(screen.getByTestId("entry-recall-6")));
    expect(setMomentRecall).toHaveBeenCalledWith("e1", [1, 12]);
    expect(screen.getByTestId("entry-recall-6")).toHaveAttribute("aria-pressed", "false");
  });
  it("board 20: a card titled without a colon, a ✓ on each chip that's on (not colour alone), and the helper line", async () => {
    setMomentRecall.mockResolvedValue({ status: "ok", months: [1] });
    render(<Harness start={[1, 12]} />);
    const card = screen.getByTestId("entry-recall");
    expect(card).toHaveAccessibleName(messages.entry.recallIn);
    expect(messages.entry.recallIn).not.toMatch(/:$/);
    expect(card).toHaveAccessibleDescription(messages.entry.recallHelp);
    expect(card).toHaveTextContent(messages.entry.recallHelp);
    expect(screen.getByTestId("entry-recall-1-check")).toBeInTheDocument();
    expect(screen.queryByTestId("entry-recall-6-check")).toBeNull();
    expect(screen.getByTestId("entry-recall-12-check")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByTestId("entry-recall-12")));
    expect(screen.queryByTestId("entry-recall-12-check")).toBeNull();
  });
  it("a failed save puts the chip back and says so", async () => {
    setMomentRecall.mockResolvedValue({ status: "error" });
    render(<Harness start={[1, 6, 12]} />);
    await act(async () => fireEvent.click(screen.getByTestId("entry-recall-1")));
    expect(screen.getByTestId("entry-recall-1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("entry-recall-error")).toBeInTheDocument();
  });
});
