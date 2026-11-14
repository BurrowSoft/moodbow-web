import { afterEach, describe, expect, it, vi } from "vitest";
import { cropFor, encodePicture, PICTURE_MAX } from "./picture";

// A JPEG's EXIF lives in an APP1 segment (FF E1) whose data starts "Exif\0\0".
const hasExif = (bytes: Uint8Array) => {
  for (let i = 0; i + 9 < bytes.length; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xe1 && String.fromCharCode(...bytes.slice(i + 4, i + 8)) === "Exif") return true;
  }
  return false;
};
// A JPEG header carrying EXIF with a GPS-like tag in it (enough for the check; never decoded here).
const withExif = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x16, ...[..."Exif"].map((c) => c.charCodeAt(0)), 0, 0, ...[..."GPS 51.5N 0.1W"].map((c) => c.charCodeAt(0)), 0xff, 0xd9]);
// What a canvas writes: a plain JPEG (APP0/JFIF), no APP1.
const fromCanvas = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...[..."JFIF"].map((c) => c.charCodeAt(0)), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

afterEach(() => vi.unstubAllGlobals());

describe("cropFor: the centre 2:1, at most 1200 × 600", () => {
  it("a tall phone photo: its full width, the middle band", () => {
    expect(cropFor(3000, 4000)).toEqual({ sx: 0, sy: 1250, sw: 3000, sh: 1500, width: 1200, height: 600 });
  });
  it("a wide panorama: its full height, the middle part", () => {
    expect(cropFor(5000, 1000)).toEqual({ sx: 1500, sy: 0, sw: 2000, sh: 1000, width: 1200, height: 600 });
  });
  it("a small picture is never enlarged", () => {
    const c = cropFor(400, 300);
    expect(c.width).toBe(400);
    expect(c.height).toBe(200);
    expect(c.width).toBeLessThanOrEqual(PICTURE_MAX.width);
  });
});

describe("encodePicture: only pixels survive (no EXIF, no GPS)", () => {
  it("the file goes through a canvas: what's kept is the canvas's new JPEG, never the file's bytes", async () => {
    const file = new Blob([withExif], { type: "image/jpeg" });
    expect(hasExif(new Uint8Array(await file.arrayBuffer()))).toBe(true);
    const bitmap = { width: 3000, height: 4000, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    const drawImage = vi.fn();
    const toBlob = vi.fn((done: (b: Blob) => void, type: string) => done(new Blob([fromCanvas], { type })));
    const create = document.createElement.bind(document);
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag !== "canvas") return create(tag);
      const canvas = create("canvas") as HTMLCanvasElement;
      Object.assign(canvas, { getContext: () => ({ drawImage }), toBlob });
      return canvas;
    });
    const out = await encodePicture(file);
    spy.mockRestore();
    expect(out).not.toBeNull();
    expect(out).not.toBe(file);
    expect(out!.type).toBe("image/jpeg");
    expect(hasExif(new Uint8Array(await out!.arrayBuffer()))).toBe(false);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 1250, 3000, 1500, 0, 0, 1200, 600);
    expect(bitmap.close).toHaveBeenCalled();
  });
  it("not an image, or one the browser can't read: nothing kept", async () => {
    expect(await encodePicture(new Blob(["hello"], { type: "text/plain" }))).toBeNull();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("bad"))));
    expect(await encodePicture(new Blob([withExif], { type: "image/jpeg" }))).toBeNull();
  });
});
