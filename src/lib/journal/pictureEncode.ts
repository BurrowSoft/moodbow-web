// The browser side of adding a picture (035): the chosen file is decoded (the photo's orientation
// applied) and drawn onto a canvas twice, at most 2048 px and 400 px on the longest side, each
// encoded afresh as JPEG. Only pixels survive: no EXIF, no GPS, no camera serial (a canvas has
// none to write). A motion photo gives its still frame (the browser decodes the image, not the
// video). A file the browser can't decode (HEIC on most desktops) gives null.
import { fitWithin, PICTURES } from "./pictures";

export type EncodedPicture = { full: Blob; thumb: Blob; width: number; height: number };

async function draw(bitmap: ImageBitmap, side: number, qualities: number[]): Promise<{ blob: Blob; width: number; height: number } | null> {
  const size = fitWithin(bitmap.width, bitmap.height, side);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  for (const q of qualities) {
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob((b) => done(b), "image/jpeg", q));
    if (blob && blob.size <= PICTURES.fileMax - 256 * 1024) return { blob, ...size };
  }
  return null;
}

export async function encodeForUpload(file: Blob): Promise<EncodedPicture | null> {
  if (!file.type.startsWith("image/")) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    const full = await draw(bitmap, PICTURES.fullSide, [PICTURES.quality, 0.75, 0.65]);
    const thumb = await draw(bitmap, PICTURES.thumbSide, [0.8]);
    if (!full || !thumb) return null;
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
  } finally {
    bitmap.close();
  }
}
