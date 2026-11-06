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
    // Upright, by the file's own orientation, which goes with its metadata.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
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
    const blob = await encoded(canvas, quality);
    if (!blob) return { ok: false };
    if (blob.size > BO_PICTURE_MAX_BYTES) continue;
    // Checked, not assumed: anything but a clean JPEG doesn't leave.
    const segments = jpegMetadataSegments(new Uint8Array(await blob.arrayBuffer()));
    if (!segments || segments.length > 0) return { ok: false };
    return { ok: true, blob, base64: await asBase64(blob), width: canvas.width, height: canvas.height };
  }
  return { ok: false };
}
