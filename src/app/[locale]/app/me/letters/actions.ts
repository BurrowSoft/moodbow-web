"use server";

import { forClient, isLetterMonths, LETTER_RULES, parseLetterRows, type Letter, type LetterMonths } from "@/lib/journal/letters";
import { ENTITLEMENT_COLUMNS, parseEntitlement } from "@/lib/plus/entitlements";
import { lapseDay, letterWrite, lettersGate } from "@/lib/plus/letters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Letters to future me (1.2): every write is one of migration 027's functions. What comes
// back is the client's view: a locked letter's text never leaves the server.
// Part of Moodbow Plus (1.3 §3): only saving a new letter checks Plus, here on the server.
// Open, Not now, delete and the list never do: someone's own words are never held back.
export type LetterResult = { status: "ok"; letters: Letter[] } | { status: "error" } | { status: "plus_required" };
export type OpenResult = { status: "ok"; body: string } | { status: "error" };

async function client() {
  // Not where it's off: the flag is the server's too, for a client calling this directly.
  if (lettersGate() === "hidden") return null;
  return createSupabaseServerClient();
}
type Supabase = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

// The person's own entitlements row (RLS: read own only). A read that fails is an error, never a pass.
async function mayWrite(supabase: Supabase): Promise<boolean | null> {
  const { data, error } = await supabase.from("entitlements").select(ENTITLEMENT_COLUMNS).maybeSingle();
  if (error) return null;
  const row = parseEntitlement(data);
  const first = letterWrite(row, false);
  if (first !== "lapsed_once") return first === "plus";
  // A draft in progress when Plus lapsed: saved once, so only if nothing was written since that day.
  const since = row ? lapseDay(row) : null;
  if (!since) return false;
  const { count, error: countError } = await supabase.from("letters").select("id", { count: "exact", head: true }).gte("written_on", since);
  if (countError) return null;
  return letterWrite(row, (count ?? 0) > 0) === "lapsed_once";
}
type Client = NonNullable<Awaited<ReturnType<typeof client>>>;

async function list(supabase: Client): Promise<LetterResult> {
  const { data, error } = await supabase.from("letters").select("id, body, written_on, opens_on, card_from, opened_at");
  return error ? { status: "error" } : { status: "ok", letters: parseLetterRows(data).map(forClient) };
}

export async function saveLetter(body: string, months: LetterMonths): Promise<LetterResult> {
  if (typeof body !== "string" || body.trim() === "" || [...body].length > LETTER_RULES.maxChars || !isLetterMonths(months)) return { status: "error" };
  const supabase = await client();
  if (!supabase) return { status: "error" };
  const may = await mayWrite(supabase);
  if (may === null) return { status: "error" };
  if (!may) return { status: "plus_required" };
  const { error } = await supabase.rpc("letter_save", { p_body: body, p_months: months });
  return error ? { status: "error" } : list(supabase);
}

// On the day, or early (the person's choice). The text comes back only now.
export async function openLetter(id: string): Promise<OpenResult> {
  const supabase = await client();
  if (!supabase) return { status: "error" };
  const { data, error } = await supabase.rpc("letter_open", { p_id: id });
  const body = (data as { body?: unknown } | null)?.body;
  return error || typeof body !== "string" ? { status: "error" } : { status: "ok", body };
}

export async function letterNotNow(id: string): Promise<{ status: "ok" | "error" }> {
  const supabase = await client();
  if (!supabase) return { status: "error" };
  const { error } = await supabase.rpc("letter_not_now", { p_id: id });
  return { status: error ? "error" : "ok" };
}

export async function deleteLetter(id: string): Promise<LetterResult> {
  const supabase = await client();
  if (!supabase) return { status: "error" };
  const { error } = await supabase.rpc("letter_delete", { p_id: id });
  return error ? { status: "error" } : list(supabase);
}
