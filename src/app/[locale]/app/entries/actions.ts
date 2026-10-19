"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { ENTRY_COLUMNS, entryErrorAction, isEntryId, parseEntry, sameEntry, type Entry, type EntryError } from "@/lib/journal/entry";
import { originOf } from "@/lib/journal/origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// stale: the entry changed (or was deleted) on another device since the
// editor loaded it. `latest` is the server's version now (null if it's
// gone), so the editor can ask which one to keep (decision 87).
export type EntryState =
  | { status: "idle" }
  | { status: "saved"; entry: Entry }
  | { status: "error"; error: Exclude<EntryError, "stale"> }
  | { status: "error"; error: "stale"; latest: Entry | null };

// Creates or edits an entry (save_entry). The id comes from the editor (a
// new entry's id is made when its draft starts, so a retried save is
// idempotent); expected_updated_at is the version the editor started from.
export async function saveEntry(_prev: EntryState, form: FormData): Promise<EntryState> {
  const input = parseEntry(form);
  if (!input) return { status: "error", error: "generic" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", error: "generic" };

  // No version to lock against (a new entry, or "Keep it" after a delete
  // elsewhere): save_entry would UPDATE an existing row with this id without
  // asking. The row exists when an earlier save's answer was lost, and may
  // have been edited since (here or on another device). Read it first, the
  // same as the app: none → save; the same text → already saved; different
  // → the decision 87 dialog.
  if (input.expected === null) {
    const { data: existing, error: readError } = await supabase.from("entries").select(ENTRY_COLUMNS).eq("id", input.id).maybeSingle();
    if (readError) return { status: "error", error: "generic" };
    if (existing) {
      const row = existing as Entry;
      return sameEntry(row, input) ? { status: "saved", entry: row } : { status: "error", error: "stale", latest: row };
    }
  }

  const { data, error } = await supabase.rpc("save_entry", {
    p_id: input.id,
    p_date: input.date,
    p_body: input.body,
    p_is_moment: input.isMoment,
    p_expected_updated_at: input.expected,
  });
  if (error) {
    const action = entryErrorAction(error.message);
    if (action.kind === "redirect") return redirect({ href: action.to, locale: await getLocale() });
    if (action.error === "stale") {
      const { data: latest } = await supabase.from("entries").select(ENTRY_COLUMNS).eq("id", input.id).maybeSingle();
      return { status: "error", error: "stale", latest: (latest as Entry | null) ?? null };
    }
    return { status: "error", error: action.error };
  }
  return { status: "saved", entry: data as Entry };
}

// The saved version of an entry (null: there is none), for a "new" draft
// restored in the editor: its save may already have gone through.
export async function getEntry(id: string): Promise<{ status: "ok"; entry: Entry | null } | { status: "error" }> {
  if (!isEntryId(id)) return { status: "error" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error" };
  const { data, error } = await supabase.from("entries").select(ENTRY_COLUMNS).eq("id", id).maybeSingle();
  if (error) return { status: "error" };
  return { status: "ok", entry: (data as Entry | null) ?? null };
}

export type DeleteState = { status: "idle" } | { status: "error" };

// Deletes an entry (delete_entry) and goes back where it was opened from
// (from: allow-listed by originOf, else Today; decision 152). Already gone
// (not_found, e.g. deleted on another device) ends the same way.
export async function deleteEntry(_prev: DeleteState, form: FormData): Promise<DeleteState> {
  const id = String(form.get("id") ?? "");
  if (!isEntryId(id)) return { status: "error" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error" };
  const { error } = await supabase.rpc("delete_entry", { p_id: id });
  const locale = await getLocale();
  if (error) {
    if (error.message.includes("not_authenticated")) return redirect({ href: "/sign-in", locale });
    if (!error.message.includes("not_found")) return { status: "error" };
  }
  return redirect({ href: originOf(form.get("from")), locale });
}
