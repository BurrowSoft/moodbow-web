import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// The storage and the re-encode are lib/me/picture's (tested there); here, what the card does.
const stored = new Map<string, Blob>();
const encodePicture = vi.fn(async (f: Blob): Promise<Blob | null> => (f.type.startsWith("image/") ? new Blob(["px"], { type: "image/jpeg" }) : null));
vi.mock("@/lib/me/picture", () => ({
  encodePicture: (f: Blob) => encodePicture(f),
  loadPicture: async (uid: string) => stored.get(uid) ?? null,
  savePicture: async (uid: string, b: Blob) => (stored.set(uid, b), true),
  removePicture: async (uid: string) => void stored.delete(uid),
  removeOtherPictures: async (uid: string) => {
    for (const k of [...stored.keys()]) if (k !== uid) stored.delete(k);
  },
}));
let signedOut: ((m: { uid: string; mode: "keep" | "delete" }) => void) | null = null;
vi.mock("@/lib/signOutSignal", () => ({ onSignOut: (h: typeof signedOut) => ((signedOut = h), () => (signedOut = null)) }));
const { MePicture } = await import("./MePicture");
const m = messages.me;

beforeEach(() => {
  stored.clear();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:local"), revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MePicture uid="u1" />
    </NextIntlClientProvider>,
  );
const pick = async (file: File) => act(async () => fireEvent.change(screen.getByTestId("me-picture-input"), { target: { files: [file] } }));

describe("MePicture (board 6b): their own picture, this browser only", () => {
  it("the rainbow by default; one button, named for what it does; no Remove yet", () => {
    show();
    expect(screen.getByRole("button", { name: m.pictureChoose })).toBeInTheDocument();
    expect(screen.queryByTestId("me-picture-img")).toBeNull();
    expect(screen.queryByTestId("me-picture-remove")).toBeNull();
    // The sparkle dots on the default rainbow, hidden from screen readers.
    expect(screen.getByTestId("me-picture-sparkles")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("me-picture-input")).toHaveAttribute("accept", "image/*");
  });
  it("a picture chosen: re-encoded, kept, shown (decorative: the button names it); Remove brings the rainbow back", async () => {
    show();
    await pick(new File(["jpeg"], "walk.jpg", { type: "image/jpeg" }));
    expect(encodePicture).toHaveBeenCalledTimes(1);
    expect(stored.get("u1")).toBeDefined();
    expect(screen.getByTestId("me-picture-img")).toHaveAttribute("alt", "");
    expect(screen.queryByTestId("me-picture-sparkles")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: m.pictureRemove })));
    expect(stored.has("u1")).toBe(false);
    expect(screen.queryByTestId("me-picture-img")).toBeNull();
  });
  it("a file that isn't a picture: said, nothing kept", async () => {
    show();
    await pick(new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(screen.getByTestId("me-picture-failed")).toHaveTextContent(m.pictureFailed);
    expect(stored.size).toBe(0);
  });
  it("another person's picture left in this browser goes when Me opens (the Reviewer, #321)", async () => {
    stored.set("someone-else", new Blob(["px"], { type: "image/jpeg" }));
    show();
    await screen.findByTestId("me-picture-choose");
    await act(async () => {});
    expect(stored.has("someone-else")).toBe(false);
    expect(screen.queryByTestId("me-picture-img")).toBeNull();
  });
  it("kept from before: shown on landing; a sign-out (any tab) deletes it", async () => {
    stored.set("u1", new Blob(["px"], { type: "image/jpeg" }));
    show();
    expect(await screen.findByTestId("me-picture-img")).toBeInTheDocument();
    await act(async () => signedOut?.({ uid: "u1", mode: "keep" }));
    expect(stored.has("u1")).toBe(false);
    expect(screen.queryByTestId("me-picture-img")).toBeNull();
  });
});
