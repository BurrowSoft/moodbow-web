// The share card's PNG carries pixels and nothing else (specs/m10: "no
// metadata"), on every browser: canvas encoders add their own chunks
// (Firefox a private deBG with a per-export id, WebKit sBIT and an iCCP).
// This keeps only the chunks needed to show the image and drops every
// other one, without re-encoding: kept chunks are copied byte for byte,
// CRCs included (UX, after the Web Tester's #25 run).

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const KEPT_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND", "sRGB"]);

// The PNG with only KEPT_CHUNKS, or null if the bytes aren't a well-formed
// PNG (never shared then).
export function stripPngMetadata(png: Uint8Array): Uint8Array | null {
  if (png.length < SIGNATURE.length || SIGNATURE.some((b, i) => png[i] !== b)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const kept: Uint8Array[] = [png.subarray(0, SIGNATURE.length)];
  let at = SIGNATURE.length;
  let ended = false;
  while (!ended) {
    if (at + 12 > png.length) return null;
    const length = view.getUint32(at);
    const end = at + 12 + length;
    if (end > png.length) return null;
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (KEPT_CHUNKS.has(type)) kept.push(png.subarray(at, end));
    ended = type === "IEND";
    at = end;
  }
  // IHDR first, at least one IDAT (reviewer #31); IEND was reached above.
  const types = kept.slice(1).map((c) => String.fromCharCode(...c.subarray(4, 8)));
  if (types[0] !== "IHDR" || !types.includes("IDAT")) return null;
  const out = new Uint8Array(kept.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of kept) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// The chunk types in order (for tests and checks).
export function pngChunkTypes(png: Uint8Array): string[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const types: string[] = [];
  for (let at = SIGNATURE.length; at + 12 <= png.length; ) {
    const length = view.getUint32(at);
    types.push(String.fromCharCode(...png.subarray(at + 4, at + 8)));
    at += 12 + length;
  }
  return types;
}
