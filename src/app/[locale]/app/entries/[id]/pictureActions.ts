"use server";

import { removePictureFiles } from "@/lib/journal/pictureFiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PictureDeleteResult = { status: "ok" } | { status: "error" };

// Removing one of the person's own pictures (035), in this order (UX and the Reviewer, 14 Nov):
// 1. its two files, under their own session, while the row is live (036 allows it then), checked
//    gone: Storage lets the uploader read their own file whatever the row says, so the files must
//    really go before the row does;
// 2. the row (picture_delete: no Plus or consent check). Its trigger still queues the paths, so the
//    cron is the backstop for anything step 1 missed.
// "Deleted" only when both happened. A failed remove changes nothing (they try again); a failed row
// delete after the files went leaves a row with no files (the tile can't load; × again retries).
// Never gated by pictures-live: removing one's own picture always works (only adding is gated).
export async function deletePicture(id: string): Promise<PictureDeleteResult> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { status: "error" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error" };
  const { data, error: readError } = await supabase.from("entry_pictures").select("path, thumb_path").eq("id", id).maybeSingle();
  const row = data as { path?: string; thumb_path?: string } | null;
  if (readError || !row?.path || !row.thumb_path) return { status: "error" };
  if (!(await removePictureFiles(supabase, [row.path, row.thumb_path]))) return { status: "error" };
  const { error } = await supabase.rpc("picture_delete", { p_id: id });
  return error ? { status: "error" } : { status: "ok" };
}
