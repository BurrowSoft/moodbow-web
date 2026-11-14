import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { EntryPicture } from "@/lib/journal/pictures";
import { SAVE_WAIT_MS } from "@/lib/ui/withTimeout";

const deletePicture = vi.fn(async (_id: string) => ({ status: "ok" as const }));
vi.mock("./pictureActions", () => ({ deletePicture: (id: string) => deletePicture(id) }));
const encodeForUpload = vi.fn(async (f: Blob) => (f.type.startsWith("image/") ? { full: new Blob(["f"], { type: "image/jpeg" }), thumb: new Blob(["t"], { type: "image/jpeg" }), width: 2048, height: 1536 } : null));
vi.mock("@/lib/journal/pictureEncode", () => ({ encodeForUpload: (f: Blob) => encodeForUpload(f) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { EntryPictures } = await import("./EntryPictures");
const m = messages.entry;

const pic = (id: string): EntryPicture => ({ id, width: 2048, height: 1536, created_at: "2026-11-14T09:00:00Z", full: `https://signed.example/${id}.jpg`, thumb: `https://signed.example/${id}_t.jpg` });
function Harness({ start, add }: { start: EntryPicture[]; add: "open" | "locked" | "none" }) {
  const [list, setList] = useState(start);
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <EntryPictures entryId="e1" pictures={list} onChange={setList} add={add} />
    </NextIntlClientProvider>
  );
}
const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("EntryPictures (035, board 20)", () => {
  it("thumbnails under the text, each opening full size (plain img, signed URL), each with ×; named for screen readers", () => {
    render(<Harness start={[pic("p1"), pic("p2")]} add="open" />);
    expect(screen.getAllByTestId("entry-picture")).toHaveLength(2);
    expect(screen.getByRole("button", { name: m.pictureOpen.replace("{n}", "2").replace("{total}", "2") })).toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId("entry-picture-open")[0]);
    const full = screen.getByTestId("entry-picture-full");
    expect(full.tagName).toBe("IMG");
    expect(full).toHaveAttribute("src", "https://signed.example/p1.jpg");
    expect(screen.getAllByTestId("entry-picture-remove")[0]).toHaveAccessibleName(m.pictureRemove.replace("{n}", "1"));
  });

  it("a moment with room and Plus: the + tile adds one (re-encoded, then the route); at 3, no tile", async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ status: "ok", picture: pic("p3") }) });
    render(<Harness start={[pic("p1"), pic("p2")]} add="open" />);
    expect(screen.getByTestId("entry-picture-add")).toHaveAccessibleName(m.pictureAdd);
    await act(async () => fireEvent.change(screen.getByTestId("entry-picture-input"), { target: { files: [new File(["x"], "walk.jpg", { type: "image/jpeg" })] } }));
    expect(encodeForUpload).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: FormData }];
    expect(url).toBe("/api/pictures");
    expect(init.body.get("entry")).toBe("e1");
    expect(screen.getAllByTestId("entry-picture")).toHaveLength(3);
    expect(screen.queryByTestId("entry-picture-add")).toBeNull();
  });

  it("stopped waiting (SAVE_WAIT_MS): the slow line, since the server may still finish; adding works again (audit B)", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"));
    render(<Harness start={[pic("p1")]} add="open" />);
    await act(async () => fireEvent.change(screen.getByTestId("entry-picture-input"), { target: { files: [new File(["x"], "walk.jpg", { type: "image/jpeg" })] } }));
    const [, init] = fetchMock.mock.calls[0] as [string, { signal?: AbortSignal }];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(SAVE_WAIT_MS);
    expect(screen.getByTestId("entry-picture-slow")).toHaveTextContent(m.pictureSlow);
    expect(screen.queryByTestId("entry-picture-error")).toBeNull();
    expect(screen.getByTestId("entry-picture-add")).not.toBeDisabled();
    timeout.mockRestore();
  });

  it("a real failure (the request failed, or the server refused): the generic line, never the slow one", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<Harness start={[pic("p1")]} add="open" />);
    await act(async () => fireEvent.change(screen.getByTestId("entry-picture-input"), { target: { files: [new File(["x"], "walk.jpg", { type: "image/jpeg" })] } }));
    expect(screen.getByTestId("entry-picture-error")).toHaveTextContent(messages.today.errGeneric);
    expect(screen.queryByTestId("entry-picture-slow")).toBeNull();
    fetchMock.mockResolvedValueOnce({ json: async () => ({ status: "error", error: "generic" }) });
    await act(async () => fireEvent.change(screen.getByTestId("entry-picture-input"), { target: { files: [new File(["x"], "walk.jpg", { type: "image/jpeg" })] } }));
    expect(screen.getByTestId("entry-picture-error")).toHaveTextContent(messages.today.errGeneric);
  });

  it("without Plus: the camera is a lock to the Plus screen (adding is Plus; viewing and removing aren't)", () => {
    render(<Harness start={[pic("p1")]} add="locked" />);
    const camera = screen.getByTestId("entry-picture-camera");
    expect(camera).toHaveAttribute("href", "/app/me/plus");
    expect(camera).toHaveAccessibleName(m.pictureAddLocked);
    expect(screen.queryByTestId("entry-picture-input")).toBeNull();
    expect(screen.getByTestId("entry-picture-remove")).toBeInTheDocument();
  });

  it("not a moment (kept after unstarring): viewable and removable, nothing to add; none and nothing to add: nothing at all", () => {
    render(<Harness start={[pic("p1")]} add="none" />);
    expect(screen.getByTestId("entry-picture")).toBeInTheDocument();
    expect(screen.queryByTestId("entry-picture-add")).toBeNull();
    expect(screen.queryByTestId("entry-picture-camera")).toBeNull();
    cleanup();
    render(<Harness start={[]} add="none" />);
    expect(screen.queryByTestId("entry-pictures")).toBeNull();
  });

  it("× removes it; a failure says so and keeps it", async () => {
    render(<Harness start={[pic("p1"), pic("p2")]} add="open" />);
    await act(async () => fireEvent.click(screen.getAllByTestId("entry-picture-remove")[0]));
    expect(deletePicture).toHaveBeenCalledWith("p1");
    expect(screen.getAllByTestId("entry-picture")).toHaveLength(1);
    deletePicture.mockResolvedValueOnce({ status: "error" } as never);
    await act(async () => fireEvent.click(screen.getByTestId("entry-picture-remove")));
    expect(screen.getAllByTestId("entry-picture")).toHaveLength(1);
    expect(screen.getByTestId("entry-picture-error")).toHaveTextContent(messages.today.errGeneric);
  });

  it("the month's allowance reached: the plain line; a file the browser can't use: try a JPEG or PNG", async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ status: "error", error: "picture_quota" }) });
    render(<Harness start={[]} add="open" />);
    await act(async () => fireEvent.change(screen.getByTestId("entry-picture-input"), { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } }));
    expect(screen.getByTestId("entry-pictures-quota")).toHaveTextContent(m.pictureQuota);
    await act(async () => fireEvent.change(screen.getByTestId("entry-picture-input"), { target: { files: [new File(["x"], "a.txt", { type: "text/plain" })] } }));
    expect(screen.getByTestId("entry-picture-error")).toHaveTextContent(m.pictureFailed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
