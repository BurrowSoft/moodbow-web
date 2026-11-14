"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PictureDeleteResult = { status: "ok" } | { status: "error" };

// Removing one of the person's own pictures (035): the row goes (picture_delete: always allowed,
// no Plus or consent check). From that moment its files can't be read or signed by anyone (036:
// storage needs a live row), and the row's trigger has queued them for the picture-deletions cron,
// which deletes them through the Storage API.
export async function deletePicture(id: string): Promise<PictureDeleteResult> {
  // Never gated by pictures-live: removing one's own picture always works (only adding is gated).
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { status: "error" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error" };
  const { error } = await supabase.rpc("picture_delete", { p_id: id });
  return error ? { status: "error" } : { status: "ok" };
}
