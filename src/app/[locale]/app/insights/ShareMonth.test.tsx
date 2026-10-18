import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const loadMonthCheckIns = vi.fn();
vi.mock("./shareActions", () => ({ loadMonthCheckIns: (...a: unknown[]) => loadMonthCheckIns(...a) }));
const { ShareMonth } = await import("./ShareMonth");
const m = messages.share;

const days = (n: number) => Array.from({ length: n }, (_, i) => ({ local_date: `2026-10-${String(i + 1).padStart(2, "0")}`, mood: (i % 5) + 1 }));
const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ShareMonth month="2026-10" dateLocaleTag="en-US" />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  loadMonthCheckIns.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ShareMonth", () => {
  it("fewer than 5 check-ins that month: shareNotEnough, no card", async () => {
    loadMonthCheckIns.mockResolvedValue({ status: "ok", checkIns: days(4) });
    renderIt();
    fireEvent.click(screen.getByTestId("share-open"));
    expect(await screen.findByTestId("share-not-enough")).toHaveTextContent(m.shareNotEnough);
    expect(screen.queryByTestId("share-preview")).toBeNull();
    expect(loadMonthCheckIns).toHaveBeenCalledWith("2026-10");
  });

  it("enough: the preview, the format/theme choices, the line (capped per format) and the privacy note", async () => {
    loadMonthCheckIns.mockResolvedValue({ status: "ok", checkIns: days(12) });
    renderIt();
    fireEvent.click(screen.getByTestId("share-open"));
    expect(await screen.findByTestId("share-preview")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: m.shareTitle })).toHaveTextContent(m.sharePrivacyNote);
    expect(screen.getByTestId("share-format-story")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(m.shareAddLine)).toHaveAttribute("maxLength", "80");
    fireEvent.click(screen.getByTestId("share-format-square"));
    expect(screen.getByLabelText(m.shareAddLine)).toHaveAttribute("maxLength", "60");
    fireEvent.click(screen.getByTestId("share-theme-dark"));
    expect(screen.getByTestId("share-theme-dark")).toHaveAttribute("aria-pressed", "true");
  });

  it("without file sharing: 'Download image' saves moodbow-2026-10.png", async () => {
    loadMonthCheckIns.mockResolvedValue({ status: "ok", checkIns: days(6) });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob(["png"], { type: "image/png" })));
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    renderIt();
    fireEvent.click(screen.getByTestId("share-open"));
    const send = await screen.findByTestId("share-send");
    expect(send).toHaveTextContent(m.shareDownload);
    fireEvent.click(send);
    await waitFor(() => expect(names).toEqual(["moodbow-2026-10.png"]));
  });

  it("with file sharing: 'Share' hands the PNG to the system share sheet", async () => {
    loadMonthCheckIns.mockResolvedValue({ status: "ok", checkIns: days(6) });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob(["png"], { type: "image/png" })));
    const share = vi.fn(async () => {});
    Object.assign(navigator, { canShare: () => true, share });
    renderIt();
    fireEvent.click(screen.getByTestId("share-open"));
    const send = await screen.findByTestId("share-send");
    expect(send).toHaveTextContent(m.shareSend);
    fireEvent.click(send);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const files = (share.mock.calls[0] as unknown as [{ files: File[] }])[0].files;
    expect(files[0].name).toBe("moodbow-2026-10.png");
    expect(files[0].type).toBe("image/png");
    Object.assign(navigator, { canShare: undefined, share: undefined });
  });

  it("a failed load says so", async () => {
    loadMonthCheckIns.mockResolvedValue({ status: "error" });
    renderIt();
    fireEvent.click(screen.getByTestId("share-open"));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.today.errGeneric);
  });
});
