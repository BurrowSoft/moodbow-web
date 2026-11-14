import type { SupabaseClient } from "@supabase/supabase-js";

// Pictures for moments (035; spec "Pictures for moments" and "Pictures 035: build rulings"):
// up to 3 on an entry, added only while it's a moment and only with Plus; viewing, export and
// deleting always work. Files live in the private entry-pictures bucket; the browser only ever gets
// signed URLs of at most 5 minutes, made on the server per view, rendered with a plain <img>
// (never next/image's optimizer, which would cache the photos on Vercel).

export const PICTURES = {
  perEntry: 3,
  fullSide: 2048,
  thumbSide: 400,
  quality: 0.85,
  // The bucket's limit is 3 MB a file; the encoder aims under it, and the two files together stay
  // under the platform's request limit.
  fileMax: 3 * 1024 * 1024,
  signedSeconds: 300,
  bucket: "entry-pictures",
} as const;

export type EntryPicture = { id: string; width: number; height: number; created_at: string; full: string; thumb: string };

type Row = { id: string; entry_id: string; path: string; thumb_path: string; width: number; height: number; created_at: string };

// The pictures of these entries (the person's own, confirmed: RLS), each with short-lived signed
// URLs for the full picture and its thumbnail. null when they can't be read: the caller shows the
// entry without them, never someone else's and never a guess.
export async function readEntryPictures(supabase: SupabaseClient, entryIds: string[], want: { full: boolean } = { full: true }): Promise<Map<string, EntryPicture[]> | null> {
  const out = new Map<string, EntryPicture[]>();
  if (entryIds.length === 0) return out;
  const { data, error } = await supabase.from("entry_pictures").select("id, entry_id, path, thumb_path, width, height, created_at").in("entry_id", entryIds).order("created_at");
  if (error || !Array.isArray(data)) return null;
  const rows = data as Row[];
  if (rows.length === 0) return out;
  const paths = rows.flatMap((r) => (want.full ? [r.path, r.thumb_path] : [r.thumb_path]));
  const signed = await supabase.storage.from(PICTURES.bucket).createSignedUrls(paths, PICTURES.signedSeconds);
  if (signed.error || !signed.data) return null;
  const url = new Map(signed.data.filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl as string]));
  for (const r of rows) {
    const thumb = url.get(r.thumb_path);
    const full = want.full ? url.get(r.path) : thumb;
    if (!thumb || !full) continue;
    const list = out.get(r.entry_id) ?? [];
    list.push({ id: r.id, width: r.width, height: r.height, created_at: r.created_at, full, thumb });
    out.set(r.entry_id, list);
  }
  return out;
}

// A JPEG carrying any metadata segment before its image data: APP1-APP15 (EXIF and XMP in APP1,
// IPTC in APP13, maker data elsewhere) or a comment (COM). The browser's canvas re-encode writes
// APP0 (JFIF) and, in Chromium, APP2 "ICC_PROFILE": the browser's own sRGB colour profile for the
// canvas, never the photo's (checked on a real Chromium canvas: E0 JFIF, E2 ICC_PROFILE, then the
// tables). So an APP2 that is exactly an ICC profile segment passes; anything else means the file
// didn't come through the re-encode, and the server refuses it (the Reviewer, #322). The marker
// segments are walked, not scanned for bytes; a file that can't be walked to its first scan (SOS)
// counts as carrying metadata.
const ICC = [0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00]; // "ICC_PROFILE\0"
const isIccSegment = (bytes: Uint8Array, at: number, length: number) => length >= 2 + ICC.length && ICC.every((c, k) => bytes[at + 4 + k] === c);
export function hasMetadata(bytes: Uint8Array): boolean {
  if (!isJpeg(bytes)) return true;
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) return true;
    let m = bytes[i + 1];
    // Fill bytes (0xFF 0xFF ...) before a marker.
    while (m === 0xff && i + 2 < bytes.length) {
      i++;
      m = bytes[i + 1];
    }
    if (m === 0xda) return false; // the image data starts: nothing before it carried metadata
    if (m === 0xd9) return false; // the end, with no image data (nothing to carry)
    if (i + 3 >= bytes.length) return true;
    const segment = (bytes[i + 2] << 8) | bytes[i + 3];
    if (m === 0xe2 && isIccSegment(bytes, i, segment)) {
      i += 2 + segment;
      continue;
    }
    if ((m >= 0xe1 && m <= 0xef) || m === 0xfe) return true;
    // Standalone markers have no length.
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    if (i + 3 >= bytes.length) return true;
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) return true;
    i += 2 + length;
  }
  return true;
}
export const isJpeg = (bytes: Uint8Array) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

// The size a picture is drawn at: its longest side at most `side`, never enlarged.
export function fitWithin(w: number, h: number, side: number): { width: number; height: number } {
  const scale = Math.min(1, side / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
