import { afterEach, describe, expect, it, vi } from "vitest";
import { fitWithin, hasExif, isJpeg, PICTURES, readEntryPictures } from "./pictures";
import { encodeForUpload } from "./pictureEncode";

const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
// A JPEG header carrying an EXIF segment with GPS-like bytes (never decoded here).
const withExif = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x16, ...text("Exif"), 0, 0, ...text("GPS 51.5N 0.1W"), 0xff, 0xd9]);
// What a canvas writes: APP0 / JFIF, no APP1.
const fromCanvas = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...text("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

afterEach(() => vi.unstubAllGlobals());

describe("the byte checks the upload route relies on", () => {
  it("hasExif: an APP1 Exif segment, yes; a canvas JPEG, no", () => {
    expect(hasExif(withExif)).toBe(true);
    expect(hasExif(fromCanvas)).toBe(false);
  });
  it("isJpeg: the JPEG start marker only", () => {
    expect(isJpeg(fromCanvas)).toBe(true);
    expect(isJpeg(new Uint8Array(text("GIF89a")))).toBe(false);
  });
  it("fitWithin: the longest side at most the limit, never enlarged", () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(1800, 2400, 400)).toEqual({ width: 300, height: 400 });
    expect(fitWithin(300, 200, 2048)).toEqual({ width: 300, height: 200 });
  });
});

describe("encodeForUpload: only pixels survive (no EXIF, no GPS), at 2048 and 400 px", () => {
  it("both files are the canvas's new JPEGs, never the file's bytes; sizes fit", async () => {
    const file = new Blob([withExif], { type: "image/jpeg" });
    const bitmap = { width: 4000, height: 3000, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    const sizes: [number, number][] = [];
    const create = document.createElement.bind(document);
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag !== "canvas") return create(tag);
      const canvas = create("canvas") as HTMLCanvasElement;
      Object.assign(canvas, {
        getContext: () => ({ drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => sizes.push([w, h]) }),
        toBlob: (done: (b: Blob) => void, type: string) => done(new Blob([fromCanvas], { type })),
      });
      return canvas;
    });
    const out = await encodeForUpload(file);
    spy.mockRestore();
    expect(out).not.toBeNull();
    expect(sizes).toEqual([[2048, 1536], [400, 300]]);
    expect(out!.width).toBe(2048);
    expect(out!.height).toBe(1536);
    for (const b of [out!.full, out!.thumb]) {
      expect(b).not.toBe(file);
      expect(b.type).toBe("image/jpeg");
      expect(hasExif(new Uint8Array(await b.arrayBuffer()))).toBe(false);
    }
    expect(bitmap.close).toHaveBeenCalled();
  });
  it("not an image, or one the browser can't decode (HEIC on a desktop): nothing", async () => {
    expect(await encodeForUpload(new Blob(["hi"], { type: "text/plain" }))).toBeNull();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("bad"))));
    expect(await encodeForUpload(new Blob([withExif], { type: "image/heic" }))).toBeNull();
  });
});

describe("readEntryPictures: own rows (RLS), signed URLs of 5 minutes", () => {
  const rows = [
    { id: "p1", entry_id: "e1", path: "u/e1/p1.jpg", thumb_path: "u/e1/p1_t.jpg", width: 2048, height: 1536, created_at: "2026-11-14T09:00:00Z" },
    { id: "p2", entry_id: "e1", path: "u/e1/p2.jpg", thumb_path: "u/e1/p2_t.jpg", width: 1152, height: 2048, created_at: "2026-11-14T09:01:00Z" },
  ];
  const client = (opts: { readError?: boolean; signError?: boolean } = {}) => {
    const sign = vi.fn(async (paths: string[], _seconds: number) =>
      opts.signError ? { data: null, error: { message: "x" } } : { data: paths.map((p) => ({ path: p, signedUrl: `https://signed.example/${p}` })), error: null },
    );
    const c = {
      from: () => ({ select: () => ({ in: () => ({ order: async () => (opts.readError ? { data: null, error: { message: "x" } } : { data: rows, error: null }) }) }) }),
      storage: { from: (bucket: string) => (expect(bucket).toBe(PICTURES.bucket), { createSignedUrls: sign }) },
    };
    return { c: c as never, sign };
  };
  it("each entry's pictures in order, full and thumbnail signed for 300 s", async () => {
    const { c, sign } = client();
    const map = await readEntryPictures(c, ["e1"]);
    expect(map!.get("e1")!.map((p) => [p.id, p.full, p.thumb])).toEqual([
      ["p1", "https://signed.example/u/e1/p1.jpg", "https://signed.example/u/e1/p1_t.jpg"],
      ["p2", "https://signed.example/u/e1/p2.jpg", "https://signed.example/u/e1/p2_t.jpg"],
    ]);
    expect(sign.mock.calls[0][1]).toBe(300);
  });
  it("thumbnails only (the Timeline): only the thumbnails are signed", async () => {
    const { c, sign } = client();
    await readEntryPictures(c, ["e1"], { full: false });
    expect(sign.mock.calls[0][0]).toEqual(["u/e1/p1_t.jpg", "u/e1/p2_t.jpg"]);
  });
  it("a read or signing that fails: null (the entry without pictures, never a guess)", async () => {
    expect(await readEntryPictures(client({ readError: true }).c, ["e1"])).toBeNull();
    expect(await readEntryPictures(client({ signError: true }).c, ["e1"])).toBeNull();
  });
});
