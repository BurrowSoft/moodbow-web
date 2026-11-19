import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// Your year in Moodbow's share (1.4 A): ShareMonth with yearOnly. The Year card alone, read from
// the year (never the month), counted as year_review_share, with the note on what the image holds.
const loadMonthCheckIns = vi.fn();
const loadYearCheckIns = vi.fn();
vi.mock("./shareActions", () => ({ loadMonthCheckIns: (...a: unknown[]) => loadMonthCheckIns(...a), loadYearCheckIns: (...a: unknown[]) => loadYearCheckIns(...a) }));
const countTap = vi.fn();
vi.mock("@/lib/analyticsEvents", () => ({ countTap: (...a: unknown[]) => countTap(...a) }));
const { ShareMonth } = await import("./ShareMonth");

const year = (months: number[]) => months.flatMap((m) => Array.from({ length: 5 }, (_, d) => ({ local_date: `2026-${String(m).padStart(2, "0")}-0${d + 1}`, mood: 4 })));
const noopCtx = new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : () => {}), set: () => true });
beforeEach(() => {
  loadMonthCheckIns.mockReset();
  loadYearCheckIns.mockReset();
  countTap.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(noopCtx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(null));
  Object.assign(HTMLImageElement.prototype, { decode: () => Promise.resolve() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ShareMonth month="2026-12" dateLocaleTag="en-US" year={2026} yearOnly yearNote={messages.year.shareNote} buttonText={messages.year.share} testId="year-share" />
    </NextIntlClientProvider>,
  );

describe("ShareMonth yearOnly", () => {
  it("the Year card alone: no type choice, no month read, its own count and the note", async () => {
    loadYearCheckIns.mockResolvedValue({ status: "ok", checkIns: year([1, 2, 3]) });
    renderIt();
    expect(screen.getByTestId("year-share")).toHaveTextContent(messages.year.share);
    fireEvent.click(screen.getByTestId("year-share"));
    expect(countTap).toHaveBeenCalledWith("year_review_share");
    expect(countTap).not.toHaveBeenCalledWith("share_month_opened");
    expect(await screen.findByTestId("share-preview")).toBeTruthy();
    expect(screen.getByTestId("share-type-year")).toBeTruthy();
    expect(screen.queryByTestId("share-type-moodbow")).toBeNull();
    expect(screen.getByTestId("share-year-note")).toHaveTextContent(messages.year.shareNote);
    // The person's own optional line stays (UX's ruling, 18 Nov).
    expect(screen.getByTestId("share-line")).toBeTruthy();
    expect(loadYearCheckIns).toHaveBeenCalledWith(2026);
    expect(loadMonthCheckIns).not.toHaveBeenCalled();
  });

  it("a failed read of the year: the error line, never a month's card", async () => {
    loadYearCheckIns.mockResolvedValue({ status: "error" });
    renderIt();
    fireEvent.click(screen.getByTestId("year-share"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("share-preview")).toBeNull();
  });
});
