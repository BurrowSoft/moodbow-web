import type { SupabaseClient } from "@supabase/supabase-js";
import { PICTURES } from "./pictures";

// Removes these picture files under the person's own session and checks they're gone. Storage lets
// an object's uploader keep reading it whatever its row says (the Web Tester's A12, 14 Nov), so a
// picture's files go first, while its row is still live (036's DELETE policy allows it then), and
// only then the row. "Gone" is checked by asking for fresh signed URLs: none may come back. True
// only when every file is gone. Server code only (the callers are server actions); it is not itself
// a server action, so no browser can call it.
export async function removePictureFiles(supabase: SupabaseClient, paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const bucket = supabase.storage.from(PICTURES.bucket);
  const removed = await bucket.remove(paths);
  if (removed.error) return false;
  const left = await bucket.createSignedUrls(paths, 60);
  // A request that failed as a whole (network, 5xx) couldn't verify anything: not gone. Missing
  // objects come back as per-item errors inside a 200, with no signedUrl (the Reviewer).
  if (left.error || !left.data) return false;
  return !left.data.some((s) => s.signedUrl);
}
