import { describe, expect, it } from "vitest";
import { jpegEnd, jpegMetadataSegments, pictureComplete, withoutMetadata } from "./boPicture";

// The check itself: it must see each kind of metadata, or a clean result proves nothing.
// A hand-built JPEG's markers, so this can fail without a browser's encoder involved.
const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];
const SOI = [0xff, 0xd8];
const JFIF = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0]);
const TABLE = segment(0xdb, [1, 2, 3]);
const SCAN = [0xff, 0xda, 0, 2, 9, 9, 9, 0xff, 0xd9];
const jpeg = (...middle: number[][]) => new Uint8Array([...SOI, ...JFIF, ...middle.flat(), ...TABLE, ...SCAN]);

describe("jpegMetadataSegments", () => {
  it("nothing to find in a plain JPEG: JFIF and the image's own tables don't count", () => {
    expect(jpegMetadataSegments(jpeg())).toEqual([]);
  });
  it.each([
    ["EXIF or XMP, APP1", 0xe1],
    ["a colour profile, APP2", 0xe2],
    ["IPTC, APP13", 0xed],
    ["APP15", 0xef],
    ["a comment", 0xfe],
  ])("finds %s", (_name, marker) => {
    expect(jpegMetadataSegments(jpeg(segment(marker, [1, 2])))).toEqual([marker]);
  });
  it("what isn't a JPEG it can read is null, never a clean result", () => {
    for (const bad of [[], [0xff], [0x89, 0x50, 0x4e, 0x47], [...SOI, 0x00, 0x11, 0, 2], [...SOI, ...JFIF]]) {
      expect(jpegMetadataSegments(new Uint8Array(bad))).toBeNull();
    }
  });
});

// A cut-off file decodes as a grey picture, so it's caught before any drawing (app #228).
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngChunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...ascii(type), ...data, 1, 2, 3, 4];
const webp = (body: number[], counted = body.length + 4) => [...ascii("RIFF"), counted & 255, (counted >> 8) & 255, 0, 0, ...ascii("WEBP"), ...body];

// Walking a JPEG as a decoder does (the Reviewer, #210): the image ends at its first real EOI,
// whatever trails it. A motion photo is a JPEG with a video appended after the end.
describe("jpegEnd", () => {
  const sos = (data: number[]) => [0xff, 0xda, 0, 2, ...data];
  const EOI = [0xff, 0xd9];
  // A video trailer with bytes that look like markers, as an MP4 can hold.
  const TRAILER = [0, 0, 0, 0x18, ...ascii("ftypmp42"), 0xff, 0xda, 0, 9, 7, 0xff, 0xd9, 0xff, 0xda, 1, 2, 3];

  it("a whole JPEG ends at its EOI", () => {
    expect(jpegEnd(jpeg())).toBe(jpeg().length);
  });

  it("a motion photo: whole, ending where the image does, though the trailer holds FF DA and FF D9", () => {
    const motion = new Uint8Array([...jpeg(), ...TRAILER]);
    expect(jpegEnd(motion)).toBe(jpeg().length);
    expect(pictureComplete(motion)).toBe(true);
  });

  it("stuffed bytes and restart markers inside a scan aren't its end", () => {
    const file = [...SOI, ...TABLE, ...sos([1, 0xff, 0x00, 2, 0xff, 0xd0, 3, 0xff, 0xd7, 4]), ...EOI];
    expect(jpegEnd(new Uint8Array(file))).toBe(file.length);
  });

  it("a progressive JPEG: several scans with tables between, the end after the last", () => {
    const file = [...SOI, ...TABLE, ...sos([5, 6]), ...segment(0xc4, [1, 2]), ...sos([7, 0xff, 0x00, 8]), ...EOI, ...TRAILER];
    expect(jpegEnd(new Uint8Array(file))).toBe(file.length - TRAILER.length);
  });

  it("cut off, or not one it can walk: none", () => {
    const whole = jpeg();
    expect(jpegEnd(whole.subarray(0, whole.length - 2))).toBeNull();
    expect(jpegEnd(new Uint8Array([...SOI, ...TABLE, ...sos([1, 2, 3])]))).toBeNull();
    // A segment that claims more than the file has.
    expect(jpegEnd(new Uint8Array([...SOI, 0xff, 0xe1, 0x40, 0x00, 1, 2]))).toBeNull();
    expect(jpegEnd(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(jpegEnd(new Uint8Array([]))).toBeNull();
    // A cut-off motion photo's image is still cut off, whatever the trailer.
    expect(pictureComplete(new Uint8Array([...SOI, ...TABLE, ...sos([1, 2])]))).toBe(false);
  });
});

describe("pictureComplete", () => {
  it("a whole JPEG, PNG or WebP is complete", () => {
    expect(pictureComplete(jpeg())).toBe(true);
    expect(pictureComplete(new Uint8Array([...PNG, ...pngChunk("IHDR", [1, 2]), ...pngChunk("IEND", [])]))).toBe(true);
    expect(pictureComplete(new Uint8Array(webp([9, 9, 9, 9])))).toBe(true);
  });
  it("cut off: a JPEG with no end after its scan, a PNG short of IEND's CRC, a WebP short of its count", () => {
    const whole = jpeg();
    expect(pictureComplete(whole.subarray(0, whole.length - 2))).toBe(false);
    const png = [...PNG, ...pngChunk("IHDR", [1, 2]), ...pngChunk("IEND", [])];
    expect(pictureComplete(new Uint8Array(png.slice(0, png.length - 2)))).toBe(false);
    expect(pictureComplete(new Uint8Array(png.slice(0, png.length - 12)))).toBe(false);
    expect(pictureComplete(new Uint8Array(webp([9, 9], 20)))).toBe(false);
  });
  it("a JPEG's EXIF thumbnail ends early: only the end after the last scan counts", () => {
    const thumbnailEnd = segment(0xe1, [0xff, 0xda, 1, 0xff, 0xd9]);
    const cut = [...SOI, ...thumbnailEnd, ...TABLE, 0xff, 0xda, 0, 2, 9, 9];
    expect(pictureComplete(new Uint8Array(cut))).toBe(false);
    expect(pictureComplete(new Uint8Array([...cut, 0xff, 0xd9]))).toBe(true);
  });
  it("other formats: the decoder decides", () => {
    expect(pictureComplete(new Uint8Array(ascii("GIF89a")))).toBe(true);
  });
});

describe("withoutMetadata", () => {
  it("removes every kind, and keeps the rest byte for byte", () => {
    const dirty = jpeg(segment(0xe1, [7, 7]), segment(0xe2, [8]), segment(0xed, [9]), segment(0xfe, [6]));
    const clean = withoutMetadata(dirty);
    expect(clean).not.toBeNull();
    expect([...clean!]).toEqual([...jpeg()]);
    expect(jpegMetadataSegments(clean!)).toEqual([]);
  });
  it("what isn't a JPEG it can read gives nothing, never the input", () => {
    for (const bad of [[], [0x89, 0x50, 0x4e, 0x47], [...SOI, 0x00, 0x11, 0, 2], [...SOI, ...JFIF]]) {
      expect(withoutMetadata(new Uint8Array(bad))).toBeNull();
    }
  });
});
