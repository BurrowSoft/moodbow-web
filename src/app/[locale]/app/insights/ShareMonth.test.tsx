import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

// A 2D context that accepts every call; the image always decodes; the PNG
// is a tiny well-formed one carrying Firefox's deBG chunk (the filter's own
// tests are in lib/share/pngChunks.test.ts).
const pngChunk = (type: string, data: number[]) => {
  const out = new Uint8Array(12 + data.length);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  return out;
};
const PNG = new Uint8Array(
  [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], pngChunk("IHDR", Array(13).fill(0)), pngChunk("IDAT", [0]), pngChunk("deBG", [1, 2, 3]), pngChunk("IEND", [])].flatMap((c) => Array.from(c)),
);
const noopCtx = new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : () => {}), set: () => true });
const names: string[] = [];
beforeEach(() => {
  loadMonthCheckIns.mockReset();
  names.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(noopCtx as unknown as CanvasRenderingContext2D);
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

  const ready = async () => {
    const send = await screen.findByTestId("share-send");
    await waitFor(() => expect(send).toBeEnabled());
    return send;
  };

  it("without file sharing: 'Download image' saves moodbow-2026-10.png once the card is drawn", async () => {
    loadMonthCheckIns.mockResolvedValue({ status: "ok", checkIns: days(6) });
    renderIt();
    fireEvent.click(screen.getByTestId("share-open"));
    const send = await ready();
    expect(send).toHaveTextContent(m.shareDownload);
    fireEvent.click(send);
    expect(names).toEqual(["moodbow-2026-10.png"]);
  });

  it("with file sharing: share() is called right in the click (Safari's user activation), with the PNG", async () => {
    loadMonthCheckIns.mockResolvedValue({ status: "ok", checkIns: days(6) });
    const share = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { canShare: () => true, share });
    try {
      renderIt();
      fireEvent.click(screen.getByTestId("share-open"));
      const send = await ready();
      expect(send).toHaveTextContent(m.shareSend);
      fireEvent.click(send);
      // Synchronously, before any await.
      expect(share).toHaveBeenCalledTimes(1);
      const files = (share.mock.calls[0] as unknown as [{ files: File[] }])[0].files;
      expect(files[0].name).toBe("moodbow-2026-10.png");
      expect(files[0].type).toBe("image/png");
      // The encoder's deBG chunk didn't make it into the shared file.
      const shared = new TextDecoder("latin1").decode(await files[0].arrayBuffer());
      expect(shared).toContain("IDAT");
      expect(shared).not.toContain("deBG");
    } finally {
      Object.assign(navigator, { canShare: undefined, share: undefined });
    }
  });

  it("a PNG the filter can't read: the generic error, nothing shared or downloaded (reviewer #31)", async () => {
    loadMonthCheckIns.mockResolvedValue({ status: "ok", checkIns: days(6) });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob(["not a png"], { type: "image/png" })));
    const share = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { canShare: () => true, share });
    try {
      renderIt();
      fireEvent.click(screen.getByTestId("share-open"));
      expect(await screen.findByTestId("share-encode-failed")).toHaveTextContent(messages.today.errGeneric);
      const send = screen.getByTestId("share-send");
      expect(send).toBeDisabled();
      fireEvent.click(send);
      expect(share).not.toHaveBeenCalled();
      expect(names).toEqual([]);
    } finally {
      Object.assign(navigator, { canShare: undefined, share: undefined });
    }
  });

  it("share refused (not allowed) → a download; cancelled (AbortError) → nothing", async () => {
    loadMonthCheckIns.mockResolvedValue({ status: "ok", checkIns: days(6) });
    const share = vi.fn().mockRejectedValueOnce(new DOMException("no", "NotAllowedError")).mockRejectedValueOnce(new DOMException("cancel", "AbortError"));
    Object.assign(navigator, { canShare: () => true, share });
    try {
      renderIt();
      fireEvent.click(screen.getByTestId("share-open"));
      const send = await ready();
      fireEvent.click(send);
      await waitFor(() => expect(names).toEqual(["moodbow-2026-10.png"]));
      fireEvent.click(send);
      await new Promise((r) => setTimeout(r, 10));
      expect(names).toHaveLength(1);
    } finally {
      Object.assign(navigator, { canShare: undefined, share: undefined });
    }
  });

  it("the preview describes itself: the count and the line", async () => {
    loadMonthCheckIns.mockResolvedValue({ status: "ok", checkIns: days(7) });
    renderIt();
    fireEvent.click(screen.getByTestId("share-open"));
    fireEvent.change(await screen.findByTestId("share-line"), { target: { value: "Calmer" } });
    expect(screen.getByTestId("share-preview")).toHaveAccessibleDescription("7 days journaled Calmer");
  });

  it("a failed load says so", async () => {
    loadMonthCheckIns.mockResolvedValue({ status: "error" });
    renderIt();
    fireEvent.click(screen.getByTestId("share-open"));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.today.errGeneric);
  });
});

describe("ShareMonth: the dialog takes focus and can always be closed (a11y pass)", () => {
  it("focus moves into the dialog at once (to Cancel, while loading); Cancel closes it in every state", async () => {
    let answer!: (v: unknown) => void;
    loadMonthCheckIns.mockReturnValueOnce(new Promise((r) => (answer = r)));
    renderIt();
    fireEvent.click(screen.getByTestId("share-open"));
    expect(screen.getByTestId("share-close")).toHaveFocus();
    await act(async () => answer({ status: "ok", checkIns: days(2) }));
    expect(await screen.findByTestId("share-not-enough")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("share-close"));
    expect(screen.queryByTestId("share-dialog")).toBeNull();
  });
});

describe("ShareMonth: the default theme follows Me → Appearance (decision 133)", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });
  it("a chosen dark theme is the card's default, whatever the system says", async () => {
    document.documentElement.dataset.theme = "dark";
    loadMonthCheckIns.mockResolvedValue({ status: "ok", checkIns: days(6) });
    renderIt();
    fireEvent.click(screen.getByTestId("share-open"));
    expect(await screen.findByTestId("share-theme-dark")).toHaveAttribute("aria-pressed", "true");
  });
});
