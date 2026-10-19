// @vitest-environment node
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { pngChunkTypes, stripPngMetadata } from "./pngChunks";

// A real 1×1 RGBA PNG, built here, with the chunks browsers add: Firefox's
// private deBG (a per-export id), a tEXt, WebKit's sBIT and iCCP, a tIME.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array | number[] | string) => {
  const body = typeof data === "string" ? new TextEncoder().encode(data) : Uint8Array.from(data);
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
};
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR = chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
const SRGB = chunk("sRGB", [0]);
const IDAT = chunk("IDAT", deflateSync(Uint8Array.from([0, 0xd9, 0x7f, 0x6a, 0xff])));
const IEND = chunk("IEND", []);
const FIREFOX_LIKE = concat([
  SIG,
  IHDR,
  chunk("sBIT", [8, 8, 8, 8]),
  chunk("iCCP", "Skia\0\0x"),
  SRGB,
  chunk("tEXt", "Software\0Some browser"),
  chunk("tIME", [7, 234, 10, 19, 12, 0, 0]),
  IDAT,
  chunk("deBG", "3f9a1c0e5b7d2a46"),
  IEND,
]);

describe("stripPngMetadata (UX, after the Web Tester's #25 run)", () => {
  it("keeps only IHDR, sRGB, IDAT, IEND, in order, byte for byte", () => {
    expect(pngChunkTypes(FIREFOX_LIKE)).toEqual(["IHDR", "sBIT", "iCCP", "sRGB", "tEXt", "tIME", "IDAT", "deBG", "IEND"]);
    const out = stripPngMetadata(FIREFOX_LIKE)!;
    expect(pngChunkTypes(out)).toEqual(["IHDR", "sRGB", "IDAT", "IEND"]);
    // Nothing re-encoded: the result is exactly the kept chunks as they were.
    expect(Array.from(out)).toEqual(Array.from(concat([SIG, IHDR, SRGB, IDAT, IEND])));
    // No trace of the dropped ones.
    const text = new TextDecoder("latin1").decode(out);
    for (const s of ["deBG", "3f9a1c0e", "tEXt", "Software", "iCCP", "Skia", "tIME", "sBIT"]) expect(text).not.toContain(s);
  });

  it("a clean PNG (and a palette one) comes back the same", () => {
    const clean = concat([SIG, IHDR, IDAT, IEND]);
    expect(Array.from(stripPngMetadata(clean)!)).toEqual(Array.from(clean));
    const palette = concat([SIG, IHDR, chunk("PLTE", [255, 0, 0]), IDAT, IEND]);
    expect(pngChunkTypes(stripPngMetadata(palette)!)).toEqual(["IHDR", "PLTE", "IDAT", "IEND"]);
  });

  it("anything after IEND is dropped", () => {
    const trailing = concat([SIG, IHDR, IDAT, IEND, chunk("tEXt", "Comment\0after the end")]);
    expect(pngChunkTypes(stripPngMetadata(trailing)!)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("not a PNG, or cut short → null", () => {
    expect(stripPngMetadata(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(stripPngMetadata(FIREFOX_LIKE.subarray(0, FIREFOX_LIKE.length - 20))).toBeNull();
    expect(stripPngMetadata(concat([SIG, IHDR, IDAT]))).toBeNull();
  });
});
