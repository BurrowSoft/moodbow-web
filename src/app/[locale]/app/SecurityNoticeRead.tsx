import type { SupabaseClient } from "@supabase/supabase-js";
import { withTimeout } from "@/lib/ui/withTimeout";
import { SecurityNotice } from "./SecurityNotice";

// A security update's read must never hold Today (UX): Today renders first, in its own Suspense
// this streams in after, and past this wait, or on any failure, it shows nothing.
export const SECURITY_READ_WAIT_MS = 2000;

export async function SecurityNoticeRead({ supabase, uid }: { supabase: Pick<SupabaseClient, "rpc">; uid: string }) {
  const id = await withTimeout(Promise.resolve(supabase.rpc("security_notice_current")), SECURITY_READ_WAIT_MS).then(
    ({ data }) => data as unknown,
    () => null,
  );
  return typeof id === "string" && id !== "" ? <SecurityNotice id={id} uid={uid} /> : null;
}
