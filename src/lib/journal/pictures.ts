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

// A JPEG carrying an EXIF segment (APP1 "Exif"). The server refuses such a file: the browser's
// re-encode never writes one, so it means the file didn't come through it.
export function hasExif(bytes: Uint8Array): boolean {
  for (let i = 0; i + 9 < bytes.length; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xe1 && bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78 && bytes[i + 6] === 0x69 && bytes[i + 7] === 0x66) return true;
  }
  return false;
}
export const isJpeg = (bytes: Uint8Array) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

// The size a picture is drawn at: its longest side at most `side`, never enlarged.
export function fitWithin(w: number, h: number, side: number): { width: number; height: number } {
  const scale = Math.min(1, side / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
