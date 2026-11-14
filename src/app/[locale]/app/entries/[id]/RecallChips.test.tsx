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
  it("a failed save puts the chip back and says so", async () => {
    setMomentRecall.mockResolvedValue({ status: "error" });
    render(<Harness start={[1, 6, 12]} />);
    await act(async () => fireEvent.click(screen.getByTestId("entry-recall-1")));
    expect(screen.getByTestId("entry-recall-1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("entry-recall-error")).toBeInTheDocument();
  });
});
