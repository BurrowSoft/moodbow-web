"use server";

import { pageGate } from "@/lib/conditions";
import { isUuid } from "@/lib/journal/reflect";
import { gateChanged } from "@/lib/journal/gateChanged";
import { consentItem } from "@/lib/legalVersions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The first open's yes: the AI consent, which also turns AI on (the database's rule,
// migration 001). The 18+ row is /consent's, and this never ticks or implies it. The
// function checks both again on every send.
export async function giveBoConsent(): Promise<{ ok: boolean }> {
  if (pageGate("bo-live") === "hidden") return { ok: false };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false };
  const { error } = await supabase.rpc("record_consents", { p_items: [consentItem("ai")] });
  if (error) return { ok: false };
  gateChanged();
  return { ok: true };
}

// Clear conversation. RLS keeps it to their own messages, and replies go with them.
// Not behind the region: where Bo is off, the conversation is still theirs to clear.
export async function clearBoConversation(): Promise<{ ok: boolean }> {
  if (pageGate("bo-live") === "hidden") return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!supabase || !data.user) return { ok: false };
  const { error } = await supabase.from("bo_messages").delete().eq("user_id", data.user.id);
  return { ok: !error };
}

export async function setBoReadsJournal(on: boolean): Promise<{ ok: boolean }> {
  if (pageGate("bo-live") === "hidden" || typeof on !== "boolean") return { ok: false };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false };
  const { error } = await supabase.rpc("set_bo_reads_journal", { p_on: on });
  return { ok: !error };
}

// Report one reply: the function copies only that message. A reply from this visit has
// no id on the screen, as the function doesn't send one, so its send's key finds it.
export async function reportBoReply(reply: { id: string } | { clientKey: string }): Promise<{ ok: boolean }> {
  if (pageGate("bo-live") === "hidden") return { ok: false };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false };
  let id = "id" in reply ? reply.id : null;
  if ("clientKey" in reply) {
    if (!isUuid(reply.clientKey)) return { ok: false };
    const { data: sent } = await supabase.from("bo_messages").select("id").eq("client_key", reply.clientKey).maybeSingle();
    if (!sent) return { ok: false };
    const { data: answer } = await supabase.from("bo_messages").select("id").eq("reply_to", (sent as { id: string }).id).maybeSingle();
    id = (answer as { id: string } | null)?.id ?? null;
  }
  if (!isUuid(id)) return { ok: false };
  const { error } = await supabase.rpc("bo_report", { p_message_id: id });
  return { ok: !error };
}
