"use server";

import { pageGate } from "@/lib/conditions";
import { parseToolboxItems, toolboxProblem, type ToolboxItem } from "@/lib/journal/toolbox";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Things that help me (1.2): every write is one of migration 025's functions, which check
// the limits again; the list comes back after each, so the screen shows what's stored.
export type ToolboxResult = { status: "ok"; items: ToolboxItem[] } | { status: "error"; error: "full" | "tooLong" | "empty" | "failed" };

async function client() {
  // Not where it's off: the flag is the server's too, for a client calling this directly.
  if (pageGate("toolbox-live") === "hidden") return null;
  return createSupabaseServerClient();
}

async function list(supabase: NonNullable<Awaited<ReturnType<typeof client>>>): Promise<ToolboxResult> {
  const { data, error } = await supabase.from("toolbox_items").select("id, text, position").order("position");
  return error ? { status: "error", error: "failed" } : { status: "ok", items: parseToolboxItems(data) };
}

const failed = (message: string | undefined): ToolboxResult => ({
  status: "error",
  error: message?.includes("limit_reached") ? "full" : message?.includes("invalid_value") ? "tooLong" : "failed",
});

export async function loadToolbox(): Promise<ToolboxResult> {
  const supabase = await client();
  return supabase ? list(supabase) : { status: "error", error: "failed" };
}

// position: where Undo puts a deleted item back; otherwise at the end.
export async function addToolboxItem(text: string, position?: number): Promise<ToolboxResult> {
  const problem = typeof text === "string" ? toolboxProblem(text, 0, false) : "empty";
  if (problem) return { status: "error", error: problem === "full" ? "full" : problem };
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const { error } = await supabase.rpc("toolbox_add", { p_text: text, p_position: Number.isInteger(position) ? position : null });
  return error ? failed(error.message) : list(supabase);
}

export async function updateToolboxItem(id: string, text: string): Promise<ToolboxResult> {
  const problem = typeof text === "string" ? toolboxProblem(text, 0, false) : "empty";
  if (problem) return { status: "error", error: problem === "full" ? "full" : problem };
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const { error } = await supabase.rpc("toolbox_update", { p_id: id, p_text: text });
  return error ? failed(error.message) : list(supabase);
}

export async function deleteToolboxItem(id: string): Promise<ToolboxResult> {
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const { error } = await supabase.rpc("toolbox_delete", { p_id: id });
  return error ? failed(error.message) : list(supabase);
}

export async function moveToolboxItem(id: string, step: -1 | 1): Promise<ToolboxResult> {
  if (step !== -1 && step !== 1) return { status: "error", error: "failed" };
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const { error } = await supabase.rpc("toolbox_move", { p_id: id, p_step: step });
  return error ? failed(error.message) : list(supabase);
}
