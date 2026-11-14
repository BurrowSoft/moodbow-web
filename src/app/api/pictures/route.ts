import { pageGate } from "@/lib/conditions";
import { sameOrigin } from "@/lib/http/sameOrigin";
import { hasMetadata, PICTURES, type EntryPicture } from "@/lib/journal/pictures";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Adding a picture to a moment (035), as the signed-in person (their session, RLS and the storage
// policies decide; no service role here): reserve (consent, Plus with no lapse grace, their own
// moment, 3 per entry, the month's allowance), upload the two files the browser re-encoded,
// confirm (the real sizes count). A plain request rather than a server action: the files are up
// to 3 MB and a server action's body is capped far lower. Same-origin only.
//
// The files must be JPEGs with no metadata segment at all (APP1-APP15: EXIF, XMP, IPTC...; COM):
// the browser's canvas re-encode writes only APP0, so a file carrying one didn't come through it and
// is refused (no metadata ever reaches storage). The files pass through this function on the way to
// the bucket and aren't stored by it.

export const dynamic = "force-dynamic";

export type PictureAddResult =
  | { status: "ok"; picture: EntryPicture }
  | { status: "error"; error: "plus_required" | "picture_limit" | "picture_quota" | "not_a_moment" | "invalid" | "generic" };

const KNOWN = ["plus_required", "picture_limit", "picture_quota", "not_a_moment"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const answer = (r: PictureAddResult, status = 200) => Response.json(r, { status });
const codeOf = (e: { message?: string } | null): PictureAddResult => {
  const known = KNOWN.find((k) => e?.message?.includes(k));
  return { status: "error", error: known ?? "generic" };
};

async function jpegOk(file: FormDataEntryValue | null): Promise<File | null> {
  if (!(file instanceof File) || file.size < 1 || file.size > PICTURES.fileMax || file.type !== "image/jpeg") return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return hasMetadata(bytes) ? null : file;
}
const side = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= PICTURES.fullSide ? n : null;
};

export async function POST(req: Request): Promise<Response> {
  if (pageGate("pictures-live") === "hidden") return answer({ status: "error", error: "generic" }, 404);
  if (!sameOrigin(req)) return answer({ status: "error", error: "generic" }, 403);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return answer({ status: "error", error: "invalid" }, 400);
  }
  const entry = String(form.get("entry") ?? "");
  const width = side(form.get("width"));
  const height = side(form.get("height"));
  const full = await jpegOk(form.get("full"));
  const thumb = await jpegOk(form.get("thumb"));
  if (!UUID.test(entry) || !width || !height || !full || !thumb) return answer({ status: "error", error: "invalid" }, 400);

  const supabase = await createSupabaseServerClient();
  if (!supabase) return answer({ status: "error", error: "generic" }, 503);
  const reserved = await supabase.rpc("picture_reserve", { p_entry: entry, p_bytes: full.size + thumb.size });
  const row = Array.isArray(reserved.data) ? (reserved.data[0] as { id?: string; path?: string; thumb_path?: string } | undefined) : undefined;
  if (reserved.error || !row?.id || !row.path || !row.thumb_path) return answer(codeOf(reserved.error));

  const bucket = supabase.storage.from(PICTURES.bucket);
  const options = { contentType: "image/jpeg", upsert: false, cacheControl: "300" };
  const upFull = await bucket.upload(row.path, full, options);
  const upThumb = upFull.error ? { error: upFull.error } : await bucket.upload(row.thumb_path, thumb, options);
  if (upFull.error || upThumb.error) {
    // What did go up comes out again; the reservation goes within the hour either way.
    await bucket.remove([row.path, row.thumb_path]).catch(() => undefined);
    return answer({ status: "error", error: "generic" });
  }
  const confirmed = await supabase.rpc("picture_confirm", { p_id: row.id, p_width: width, p_height: height });
  const done = Array.isArray(confirmed.data) ? (confirmed.data[0] as { id: string; width: number; height: number; created_at: string } | undefined) : undefined;
  if (confirmed.error || !done) {
    await bucket.remove([row.path, row.thumb_path]).catch(() => undefined);
    return answer(codeOf(confirmed.error));
  }
  const signed = await bucket.createSignedUrls([row.path, row.thumb_path], PICTURES.signedSeconds);
  const urls = signed.data ?? [];
  const fullUrl = urls.find((u) => u.path === row.path)?.signedUrl;
  const thumbUrl = urls.find((u) => u.path === row.thumb_path)?.signedUrl;
  if (!fullUrl || !thumbUrl) return answer({ status: "error", error: "generic" });
  return answer({ status: "ok", picture: { id: done.id, width: done.width, height: done.height, created_at: done.created_at, full: fullUrl, thumb: thumbUrl } });
}
