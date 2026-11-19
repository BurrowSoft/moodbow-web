// A picture for Bo, made safe to send, in the browser (specs/bo-design.md §8). It's drawn
// to a canvas and encoded again as a new JPEG, which leaves nothing of the file behind:
// no EXIF, GPS, XMP or IPTC, and no file name. If any of that fails, there's no picture
// at all: the file itself is never sent. In memory only, never on disk. No imports, so
// its test can run this file as it is in a real browser (e2e/bo-picture.spec.ts).

export const BO_PICTURE_LONG_SIDE = 1024;
// Well inside the function's 1,500,000 byte body, once base64 adds a third (bo.md).
export const BO_PICTURE_MAX_BYTES = 1_000_000;
// Enough to refuse early, rather than hang on a huge file.
export const BO_PICTURE_MAX_INPUT_BYTES = 30_000_000;
// No camera: a file input without capture. No SVG: it's never decoded or drawn from here.
export const BO_PICTURE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif";

const QUALITIES = [0.85, 0.7, 0.55];

export type BoPicture = { ok: true; blob: Blob; base64: string; width: number; height: number } | { ok: false };

// Every segment before the image data that could hold metadata: APP1 to APP15 and
// comments. APP0 is JFIF's header, which holds none. null: not a JPEG we can read.
export function jpegMetadataSegments(bytes: Uint8Array): number[] | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const found: number[] = [];
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    // Start of scan: the image data follows.
    if (marker === 0xda) return found;
    if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) found.push(marker);
    at += 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
  }
  return null;
}

// The same JPEG without those segments. A browser's own encoder may add one, such as a
// colour profile, so it's removed rather than trusted. null: not a JPEG we can read.
export function withoutMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xda) {
      parts.push(bytes.subarray(at));
      const clean = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
      let to = 0;
      for (const part of parts) {
        clean.set(part, to);
        to += part.length;
      }
      return clean;
    }
    const end = at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
    if (!((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe)) parts.push(bytes.subarray(at, end));
    at = end;
  }
  return null;
}

// Whether the file has its format's end. A cut-off file decodes in part, as a black or
// grey picture, so the decoder alone never says it's unreadable (app #228, Bo window
// 2026-11-09). JPEG needs its end marker after the last scan, PNG its whole IEND chunk,
// WebP all the bytes its header counts. Other formats: the decoder decides.
// Where a JPEG's image ends: just past its end-of-image marker, found by walking the file as a
// decoder does, never by searching for bytes. Segments are skipped by their own lengths (so an
// EXIF thumbnail's markers inside APP1 don't count), and each scan's compressed data up to the
// next real marker (FF 00 is a stuffed byte, FF D0–D7 restarts). Progressive files have several
// scans. Whatever follows the end, such as a motion photo's video, is a trailer, not the picture
// (the Reviewer, #210; the same rule as the app's). null: cut off, or not a JPEG it can walk.
export function jpegEnd(raw: Uint8Array): number | null {
  if (raw.length < 4 || raw[0] !== 0xff || raw[1] !== 0xd8) return null;
  let i = 2;
  while (i + 1 < raw.length) {
    if (raw[i] !== 0xff) return null;
    const marker = raw[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd9) return i + 2;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2; // markers with no length
      continue;
    }
    if (i + 3 >= raw.length) return null;
    const length = (raw[i + 2] << 8) | raw[i + 3];
    if (length < 2) return null;
    const after = i + 2 + length;
    if (after > raw.length) return null;
    if (marker !== 0xda) {
      i = after;
      continue;
    }
    // A scan: its compressed data runs to the next marker that isn't stuffing or a restart.
    let j = after;
    for (;;) {
      if (j + 1 >= raw.length) return null;
      if (raw[j] === 0xff) {
        const next = raw[j + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          j += 2;
          continue;
        }
        if (next === 0xff) {
          j += 1;
          continue;
        }
        break;
      }
      j += 1;
    }
    i = j;
  }
  return null;
}

export function pictureComplete(raw: Uint8Array): boolean {
  const at = (i: number, bytes: number[]) => i >= 0 && i + bytes.length <= raw.length && bytes.every((b, k) => raw[i + k] === b);
  const find = (bytes: number[], from = 0) => {
    for (let i = from; i + bytes.length <= raw.length; i++) if (at(i, bytes)) return i;
    return -1;
  };
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  // A JPEG is whole when its image data ends properly, trailer or not (a motion photo).
  if (at(0, [0xff, 0xd8])) return jpegEnd(raw) !== null;
  if (at(0, [0x89, 0x50, 0x4e, 0x47])) {
    // The IEND chunk whole: its type and the 4-byte CRC after it.
    const end = find(ascii("IEND"), 8);
    return end >= 0 && end + 8 <= raw.length;
  }
  if (at(0, ascii("RIFF")) && at(8, ascii("WEBP"))) {
    const size = raw[4] | (raw[5] << 8) | (raw[6] << 16) | (raw[7] << 24);
    return raw.length >= size + 8;
  }
  return true;
}

const encoded = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", quality));

const asBase64 = (blob: Blob) =>
  new Promise<string>((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });

export async function preparePicture(file: File): Promise<BoPicture> {
  if (file.size === 0 || file.size > BO_PICTURE_MAX_INPUT_BYTES || file.type === "image/svg+xml") return { ok: false };
  let canvas: HTMLCanvasElement;
  try {
    // A cut-off file is never drawn: it would go as a grey picture.
    const raw = new Uint8Array(await file.arrayBuffer());
    if (!pictureComplete(raw)) return { ok: false };
    // A JPEG's trailer (a motion photo's video) is dropped before anything reads it: only the
    // image goes on, with its own header (and so its orientation).
    const end = jpegEnd(raw);
    const image: Blob = end !== null && end < raw.length ? new Blob([raw.slice(0, end)], { type: "image/jpeg" }) : file;
    // Upright, by the file's own orientation, which goes with its metadata.
    const bitmap = await createImageBitmap(image, { imageOrientation: "from-image" });
    const scale = Math.min(1, BO_PICTURE_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const drawing = canvas.getContext("2d");
    if (!drawing) return { ok: false };
    // JPEG has no transparency, which would come out black.
    drawing.fillStyle = "#ffffff";
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
  } catch {
    return { ok: false };
  }
  for (const quality of QUALITIES) {
    const made = await encoded(canvas, quality);
    if (!made) return { ok: false };
    const clean = withoutMetadata(new Uint8Array(await made.arrayBuffer()));
    // Checked, not assumed: anything but a clean JPEG doesn't leave.
    const segments = clean && jpegMetadataSegments(clean);
    if (!clean || !segments || segments.length > 0) return { ok: false };
    if (clean.length > BO_PICTURE_MAX_BYTES) continue;
    const blob = new Blob([clean], { type: "image/jpeg" });
    return { ok: true, blob, base64: await asBase64(blob), width: canvas.width, height: canvas.height };
  }
  return { ok: false };
}
