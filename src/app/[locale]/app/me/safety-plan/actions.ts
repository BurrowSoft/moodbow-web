"use server";

import { pageGate } from "@/lib/conditions";
import { parseToolboxItems } from "@/lib/journal/toolbox";
import { parsePlan, personProblem, planHasContent, planTextTooLong, PLAN_TEXTS, type PlanPeopleSection, type PlanText, type SafetyPlan } from "@/lib/journal/safetyPlan";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// My safety plan (1.2): every write is one of migration 026's functions, which check the
// limits again; the plan comes back after each, so the screen shows what's stored. Nothing
// here logs or reports what was typed: names and numbers are other people's.
export type PlanResult = { status: "ok"; plan: SafetyPlan } | { status: "error"; error: "full" | "tooLong" | "failed" };

async function client() {
  // Not where it's off: the flag is the server's too, for a client calling this directly.
  if (pageGate("safety-plan-live") === "hidden") return null;
  return createSupabaseServerClient();
}
type Client = NonNullable<Awaited<ReturnType<typeof client>>>;

async function read(supabase: Client): Promise<PlanResult> {
  const [row, people] = await Promise.all([
    supabase.from("safety_plans").select("warning_signs, distractions, surroundings").maybeSingle(),
    supabase.from("safety_plan_people").select("id, section, name, phone, position"),
  ]);
  return row.error || people.error ? { status: "error", error: "failed" } : { status: "ok", plan: parsePlan(row.data, people.data) };
}

const failed = (message: string | undefined): PlanResult => ({
  status: "error",
  error: message?.includes("limit_reached") ? "full" : message?.includes("invalid_value") ? "tooLong" : "failed",
});
const isSection = (s: unknown): s is PlanPeopleSection => s === "people" || s === "professionals";

export async function saveSafetyPlanText(section: PlanText, text: string): Promise<PlanResult> {
  if (!PLAN_TEXTS.includes(section) || typeof text !== "string") return { status: "error", error: "failed" };
  if (planTextTooLong(text)) return { status: "error", error: "tooLong" };
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const { error } = await supabase.rpc("safety_plan_save_text", { p_section: section, p_text: text });
  return error ? failed(error.message) : read(supabase);
}

// position: where Undo puts a deleted person back; otherwise at the end of their section.
export async function addSafetyPlanPerson(section: PlanPeopleSection, name: string, phone: string, position?: number): Promise<PlanResult> {
  if (!isSection(section) || typeof name !== "string" || typeof phone !== "string") return { status: "error", error: "failed" };
  const problem = personProblem(name, phone);
  if (problem) return { status: "error", error: problem === "noName" ? "failed" : "tooLong" };
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const { error } = await supabase.rpc("safety_plan_add_person", { p_section: section, p_name: name, p_phone: phone.trim() || null, p_position: Number.isInteger(position) ? position : null });
  return error ? failed(error.message) : read(supabase);
}

export async function updateSafetyPlanPerson(id: string, name: string, phone: string): Promise<PlanResult> {
  if (typeof name !== "string" || typeof phone !== "string") return { status: "error", error: "failed" };
  const problem = personProblem(name, phone);
  if (problem) return { status: "error", error: problem === "noName" ? "failed" : "tooLong" };
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const { error } = await supabase.rpc("safety_plan_update_person", { p_id: id, p_name: name, p_phone: phone.trim() || null });
  return error ? failed(error.message) : read(supabase);
}

export async function deleteSafetyPlanPerson(id: string): Promise<PlanResult> {
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const { error } = await supabase.rpc("safety_plan_delete_person", { p_id: id });
  return error ? failed(error.message) : read(supabase);
}

// For the help card's button and Your week's link: a yes or no only, never the plan itself.
// No session, the flag off, or a failed read: no.
export async function safetyPlanHasContent(): Promise<boolean> {
  const supabase = await client();
  if (!supabase) return false;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return false;
  const [plan, toolbox] = await Promise.all([read(supabase), supabase.from("toolbox_items").select("id, text, position")]);
  if (plan.status !== "ok") return false;
  return planHasContent(plan.plan, toolbox.error ? 0 : parseToolboxItems(toolbox.data).length);
}
