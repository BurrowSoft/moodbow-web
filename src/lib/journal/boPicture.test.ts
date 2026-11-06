import { describe, expect, it } from "vitest";
import { jpegMetadataSegments, withoutMetadata } from "./boPicture";

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
