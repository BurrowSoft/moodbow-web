import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// Days you showed up (1.4 C): with showed-up-live met, the cards' count line is "Showed up on n
// days" (one family with Insights' line). Off, it stays "n days journaled" (ShareMonth.test).
vi.mock("@/lib/conditions", async (orig) => ({ ...(await orig<typeof import("@/lib/conditions")>()), pageGate: () => "live" }));
const loadMonthCheckIns = vi.fn();
vi.mock("./shareActions", () => ({ loadMonthCheckIns: (...a: unknown[]) => loadMonthCheckIns(...a), loadYearCheckIns: vi.fn() }));
const { ShareMonth } = await import("./ShareMonth");

const noopCtx = new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : () => {}), set: () => true });
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(noopCtx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(null));
  Object.assign(HTMLImageElement.prototype, { decode: () => Promise.resolve() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ShareMonth with Days you showed up on", () => {
  it("the month card says Showed up on n days", async () => {
    loadMonthCheckIns.mockResolvedValue({ status: "ok", checkIns: Array.from({ length: 7 }, (_, i) => ({ local_date: `2026-10-0${i + 1}`, mood: 4 })) });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ShareMonth month="2026-10" dateLocaleTag="en-US" />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("share-open"));
    await screen.findByTestId("share-preview");
    expect(document.getElementById("share-preview-desc")?.textContent).toContain("Showed up on 7 days");
    expect(document.getElementById("share-preview-desc")?.textContent).not.toContain("journaled");
  });
});
