import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fitWithin, hasMetadata as hasExif, isJpeg, PICTURES, readEntryPictures, stripMetadata } from "./pictures";
import { encodeForUpload } from "./pictureEncode";

const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
// A JPEG header carrying an EXIF segment with GPS-like bytes (never decoded here).
const withExif = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x16, ...text("Exif"), 0, 0, ...text("GPS 51.5N 0.1W"), 0xff, 0xd9]);
// What a canvas writes: APP0 / JFIF, no APP1.
const fromCanvas = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...text("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

afterEach(() => vi.unstubAllGlobals());

describe("the byte checks the upload route relies on", () => {
  it("hasMetadata: EXIF, XMP (with GPS) and IPTC segments, a comment, or a file that can't be walked: yes; a canvas JPEG: no", () => {
    expect(hasExif(withExif)).toBe(true);
    expect(hasExif(fromCanvas)).toBe(false);
    const xmp = text('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPSLatitude>51,30N</exif:GPSLatitude></x:xmpmeta>');
    const xmpJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...text("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xe1, (xmp.length + 2) >> 8, (xmp.length + 2) & 255, ...xmp, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
    expect(hasExif(xmpJpeg)).toBe(true);
    const iptc = text("Photoshop 3.0\0");
    expect(hasExif(new Uint8Array([0xff, 0xd8, 0xff, 0xed, 0, iptc.length + 2, ...iptc, 0xff, 0xda, 0, 2]))).toBe(true);
    expect(hasExif(new Uint8Array([0xff, 0xd8, 0xff, 0xfe, 0, 6, ...text("GPS!"), 0xff, 0xda, 0, 2]))).toBe(true);
    // APP0 then the image data: clean, even if the pixels happen to contain FF E1.
    expect(hasExif(new Uint8Array([...fromCanvas.slice(0, -2), 0xff, 0xda, 0, 2, 0xff, 0xe1, 0x45, 0x78, 0x69, 0x66, 0xff, 0xd9]))).toBe(false);
    expect(hasExif(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(true);
  });
  it("each engine's real canvas JPEG is clean as written and unchanged by the strip (Chromium, Firefox, Playwright's WebKit)", () => {
    for (const name of ["chromium-canvas.jpg", "firefox-canvas.jpg", "playwright-webkit-canvas.jpg"]) {
      const real = new Uint8Array(readFileSync(path.join(__dirname, "__fixtures__", name)));
      expect(hasExif(real), name).toBe(false);
      expect(stripMetadata(real), name).toEqual(real);
    }
  });
  it("the strip drops EXIF, XMP, IPTC, MPF and COM, keeps APP0, an ICC profile, the tables and the scan", () => {
    const icc = [...text("ICC_PROFILE"), 0, 1, 1, ...new Array(20).fill(0x20)];
    const exif = [...text("Exif"), 0, 0, ...text("GPS 51.5N")];
    const xmp = text("http://ns.adobe.com/xap/1.0/");
    const iptc = text("Photoshop 3.0");
    const seg = (m: number, body: number[]) => [0xff, m, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
    const dirty = new Uint8Array([
      0xff, 0xd8, ...seg(0xe0, text("JFIF\0")), ...seg(0xe1, exif), ...seg(0xe2, icc), ...seg(0xe1, xmp), ...seg(0xed, iptc), ...seg(0xe2, text("MPF\0")), ...seg(0xfe, text("hello")),
      ...seg(0xdb, [0, 1, 2]), 0xff, 0xda, 0, 2, 0xff, 0xe1, 7, 7, 0xff, 0xd9,
    ]);
    const clean = stripMetadata(dirty)!;
    expect(hasExif(dirty)).toBe(true);
    expect(hasExif(clean)).toBe(false);
    expect([...clean]).toEqual([0xff, 0xd8, ...seg(0xe0, text("JFIF\0")), ...seg(0xe2, icc), ...seg(0xdb, [0, 1, 2]), 0xff, 0xda, 0, 2, 0xff, 0xe1, 7, 7, 0xff, 0xd9]);
    expect(stripMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 40]))).toBeNull();
  });
  it("the bytes a real Chromium canvas wrote (the fixture, 16 x 16 at 0.85) pass the guard", () => {
    // __fixtures__/chromium-canvas.jpg: made by canvas.toBlob("image/jpeg", 0.85) in Chromium. Its
    // APP2 ICC_PROFILE segment refused every real upload until the guard allowed it (Web Tester, #322).
    const real = new Uint8Array(readFileSync(path.join(__dirname, "__fixtures__", "chromium-canvas.jpg")));
    expect(isJpeg(real)).toBe(true);
    expect(hasExif(real)).toBe(false);
  });
  it("a real Chromium canvas JPEG passes: APP0 JFIF, then APP2 ICC_PROFILE (the browser's sRGB), then the tables; any other APP2 is refused", () => {
    const icc = [...text("ICC_PROFILE"), 0, 1, 1, ...new Array(40).fill(0x20)];
    const chromium = new Uint8Array([...fromCanvas.slice(0, -2), 0xff, 0xe2, 0, icc.length + 2, ...icc, 0xff, 0xdb, 0, 3, 0, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
    expect(hasExif(chromium)).toBe(false);
    const mpf = [...text("MPF"), 0, 1, 2, 3, 4];
    expect(hasExif(new Uint8Array([...fromCanvas.slice(0, -2), 0xff, 0xe2, 0, mpf.length + 2, ...mpf, 0xff, 0xda, 0, 2]))).toBe(true);
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
