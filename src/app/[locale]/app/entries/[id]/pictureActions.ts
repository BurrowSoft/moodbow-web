"use server";

import { PICTURES } from "@/lib/journal/pictures";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PictureDeleteResult = { status: "ok" } | { status: "error" };

// Removing one of the person's own pictures (035): the row goes (picture_delete: always allowed,
// no Plus or consent check), and its two files are removed straight away through their own
// session (the bucket's owner-only DELETE policy). Whatever that misses, the row's trigger already
// queued for the picture-deletions cron.
export async function deletePicture(id: string): Promise<PictureDeleteResult> {
  // Never gated by pictures-live: removing one's own picture always works (only adding is gated).
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { status: "error" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error" };
  const { data } = await supabase.from("entry_pictures").select("path, thumb_path").eq("id", id).maybeSingle();
  const { error } = await supabase.rpc("picture_delete", { p_id: id });
  if (error) return { status: "error" };
  const row = data as { path?: string; thumb_path?: string } | null;
  if (row?.path && row.thumb_path) await supabase.storage.from(PICTURES.bucket).remove([row.path, row.thumb_path]).catch(() => undefined);
  return { status: "ok" };
}
