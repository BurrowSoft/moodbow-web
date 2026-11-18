"use server";

import { pageGate } from "@/lib/conditions";
import { parseRoutineItems, ROUTINE_ITEM_COLUMNS, routineNameProblem, type RoutineItemRow } from "@/lib/journal/routine";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Me → Routine (1.4 F): every write is one of migration 038's functions, which check the rules
// again (consents included; delete needs only a signed-in user, so a person who withdrew a
// consent can still remove data). The list comes back after each, so the screen shows what's
// stored. Nothing here is logged or counted: the names are the person's own words.
export type RoutineError = "full" | "tooLong" | "duplicate" | "consent" | "failed";
export type RoutineResult = { status: "ok"; items: RoutineItemRow[] } | { status: "error"; error: RoutineError };

async function client() {
  // Not where it's off: the flag is the server's too, for a client calling this directly.
  if (pageGate("routine-live") === "hidden") return null;
  return createSupabaseServerClient();
}
type Client = NonNullable<Awaited<ReturnType<typeof client>>>;

async function list(supabase: Client): Promise<RoutineResult> {
  const { data, error } = await supabase.from("routine_items").select(ROUTINE_ITEM_COLUMNS).order("position");
  return error ? { status: "error", error: "failed" } : { status: "ok", items: parseRoutineItems(data) };
}

const failed = (message: string | undefined): RoutineResult => ({
  status: "error",
  error: message?.includes("limit_reached")
    ? "full"
    : message?.includes("invalid_value")
      ? "tooLong"
      : message?.includes("duplicate")
        ? "duplicate"
        : message?.includes("consent_required")
          ? "consent"
          : "failed",
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nameError = (name: unknown, others: string[], adding: boolean): RoutineError | null => {
  if (typeof name !== "string") return "failed";
  const problem = routineNameProblem(name, others, adding);
  return problem === "empty" ? "failed" : problem;
};

export async function addRoutineItem(name: string): Promise<RoutineResult> {
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const current = await list(supabase);
  if (current.status !== "ok") return current;
  const problem = nameError(name, current.items.map((i) => i.name), true);
  if (problem) return { status: "error", error: problem };
  const { error } = await supabase.rpc("routine_item_add", { p_name: name });
  return error ? failed(error.message) : list(supabase);
}

export async function renameRoutineItem(id: string, name: string): Promise<RoutineResult> {
  if (typeof id !== "string" || !UUID.test(id)) return { status: "error", error: "failed" };
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const current = await list(supabase);
  if (current.status !== "ok") return current;
  const problem = nameError(name, current.items.filter((i) => i.id !== id).map((i) => i.name), false);
  if (problem) return { status: "error", error: problem };
  const { error } = await supabase.rpc("routine_item_update", { p_id: id, p_name: name, p_in_appointment: null });
  return error ? failed(error.message) : list(supabase);
}

export async function setRoutineInAppointment(id: string, on: boolean): Promise<RoutineResult> {
  if (typeof id !== "string" || !UUID.test(id) || typeof on !== "boolean") return { status: "error", error: "failed" };
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const { error } = await supabase.rpc("routine_item_update", { p_id: id, p_name: null, p_in_appointment: on });
  return error ? failed(error.message) : list(supabase);
}

export async function removeRoutineItem(id: string): Promise<RoutineResult> {
  if (typeof id !== "string" || !UUID.test(id)) return { status: "error", error: "failed" };
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const { error } = await supabase.rpc("routine_item_delete", { p_id: id });
  return error ? failed(error.message) : list(supabase);
}

export async function moveRoutineItem(id: string, step: -1 | 1): Promise<RoutineResult> {
  if (typeof id !== "string" || !UUID.test(id) || (step !== -1 && step !== 1)) return { status: "error", error: "failed" };
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const { error } = await supabase.rpc("routine_item_move", { p_id: id, p_step: step });
  return error ? failed(error.message) : list(supabase);
}
