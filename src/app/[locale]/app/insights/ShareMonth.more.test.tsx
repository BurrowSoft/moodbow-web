import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { MOOD_HEX } from "@/lib/share/moodbow";
import type { ComponentProps } from "react";

// The 1.1 cards (decision 169): the type switch, what each card draws and
// the file it saves. ShareMonth.test.tsx covers the moodbow card itself.
const loadMonthCheckIns = vi.fn();
vi.mock("./shareActions", () => ({ loadMonthCheckIns: (...a: unknown[]) => loadMonthCheckIns(...a) }));
const drawCard = vi.fn();
vi.mock("@/lib/share/drawCard", () => ({ drawCard: (...a: unknown[]) => drawCard(...a) }));
const { ShareMonth } = await import("./ShareMonth");
const m = messages.share;

const days = (n: number) => Array.from({ length: n }, (_, i) => ({ local_date: `2026-10-${String(i + 1).padStart(2, "0")}`, mood: (i % 5) + 1 }));
const milestone = { n: 100 as const, colours: [MOOD_HEX[0], MOOD_HEX[4]] };
const chart = { range: "week" as const, moods: [3, null, 5, 1, null, null, 2] };
const renderIt = (props: Partial<ComponentProps<typeof ShareMonth>> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ShareMonth month="2026-10" dateLocaleTag="en-US" {...props} />
    </NextIntlClientProvider>,
  );

// A minimal well-formed PNG (IHDR, IDAT, IEND).
const pngChunk = (type: string, data: number[]) => {
  const out = new Uint8Array(12 + data.length);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  return out;
};
const PNG = new Uint8Array([[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], pngChunk("IHDR", Array(13).fill(0)), pngChunk("IDAT", [0]), pngChunk("IEND", [])].flatMap((c) => Array.from(c)));
const names: string[] = [];
beforeEach(() => {
  loadMonthCheckIns.mockReset();
  loadMonthCheckIns.mockResolvedValue({ status: "ok", checkIns: days(6) });
  drawCard.mockReset();
  names.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob([PNG], { type: "image/png" })));
  Object.assign(HTMLImageElement.prototype, { decode: () => Promise.resolve() });
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const download = async () => {
  const send = await screen.findByTestId("share-send");
  await waitFor(() => expect(send).toBeEnabled());
  fireEvent.click(send);
};
const lastDraw = () => drawCard.mock.calls.at(-1)![1];

describe("ShareMonth: the 1.1 cards", () => {
  it("without chart or milestone: no switch, just the moodbow card (1.0 unchanged)", async () => {
    renderIt();
    fireEvent.click(screen.getByTestId("share-open"));
    expect(await screen.findByTestId("share-type-moodbow")).toHaveTextContent(m.shareMoodbow);
    expect(screen.getByTestId("share-type-moodbow").tagName).toBe("H3");
    expect(screen.queryByTestId("share-type-chart")).toBeNull();
  });

  it("the switch lists only the cards given; moodbow is chosen first", async () => {
    renderIt({ chart });
    fireEvent.click(screen.getByTestId("share-open"));
    expect(await screen.findByTestId("share-type-moodbow")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("share-type-chart")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("share-type-milestone")).toBeNull();
  });

  it("the chart card: the range's title, the points counted, the line drawn, moodbow-chart-<range>.png", async () => {
    renderIt({ chart, milestone });
    fireEvent.click(screen.getByTestId("share-open"));
    fireEvent.click(await screen.findByTestId("share-type-chart"));
    await download();
    expect(lastDraw()).toMatchObject({ monthLabel: m.shareRangeWeek, daysLabel: "4 days journaled", lineChart: chart.moods, colours: [], titleSize: undefined });
    expect(names).toEqual(["moodbow-chart-week.png"]);
  });

  it("a chart with fewer than 3 points: the chart's not-enough note, no card", async () => {
    renderIt({ chart: { range: "month", moods: [3, null, 2] } });
    fireEvent.click(screen.getByTestId("share-open"));
    fireEvent.click(await screen.findByTestId("share-type-chart"));
    expect(await screen.findByTestId("share-not-enough")).toHaveTextContent(messages.insights.chartNotEnough);
    expect(screen.queryByTestId("share-preview")).toBeNull();
  });

  it("the milestone card: '100 days of my story', the larger title, no subtitle, the latest bands, moodbow-100-days.png", async () => {
    renderIt({ chart, milestone });
    fireEvent.click(screen.getByTestId("share-open"));
    fireEvent.click(await screen.findByTestId("share-type-milestone"));
    await download();
    expect(lastDraw()).toMatchObject({ monthLabel: "100 days of my story", daysLabel: "", colours: milestone.colours, titleSize: 96, lineChart: undefined });
    expect(names).toEqual(["moodbow-100-days.png"]);
  });

  it("initialType opens on that card, and onOpen is called on opening", async () => {
    const onOpen = vi.fn();
    renderIt({ milestone, initialType: "milestone", onOpen });
    fireEvent.click(screen.getByTestId("share-open"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("share-type-milestone")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("share-format-square"));
    await download();
    expect(lastDraw()).toMatchObject({ format: "square", titleSize: 72 });
  });

  it("an initialType that isn't offered falls back to the moodbow card", async () => {
    renderIt({ chart, initialType: "milestone" });
    fireEvent.click(screen.getByTestId("share-open"));
    expect(await screen.findByTestId("share-type-moodbow")).toHaveAttribute("aria-pressed", "true");
  });
});
