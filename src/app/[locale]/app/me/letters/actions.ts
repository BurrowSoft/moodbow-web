"use server";

import { pageGate } from "@/lib/conditions";
import { forClient, isLetterMonths, LETTER_RULES, parseLetterRows, type Letter, type LetterMonths } from "@/lib/journal/letters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Letters to future me (1.2): every write is one of migration 027's functions. What comes
// back is the client's view: a locked letter's text never leaves the server.
export type LetterResult = { status: "ok"; letters: Letter[] } | { status: "error" };
export type OpenResult = { status: "ok"; body: string } | { status: "error" };

async function client() {
  // Not where it's off: the flag is the server's too, for a client calling this directly.
  if (pageGate("letters-live") === "hidden") return null;
  return createSupabaseServerClient();
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
