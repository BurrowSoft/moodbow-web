import { pageGate } from "@/lib/conditions";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseRoutineItems, ROUTINE_ITEM_COLUMNS, tickableOn, ticksByItem, ticksForDay, type RoutineItemRow } from "./routine";

export type RoutineWithTicks = RoutineItemRow & { ticks: string[] };

// The person's items with their ticks from `from` to `to` (Insights' patterns window, the
// appointment's range), through RLS. null: off here, or either read failed: then nothing about
// routine shows, never a line from half the data.
export async function readRoutineWithTicks(supabase: Client, from: string, to: string): Promise<RoutineWithTicks[] | null> {
  if (pageGate("routine-live") === "hidden") return null;
  const [items, ticks] = await Promise.all([
    supabase.from("routine_items").select(ROUTINE_ITEM_COLUMNS).order("position"),
    supabase.from("routine_ticks").select("item_id, local_date").gte("local_date", from).lte("local_date", to),
  ]);
  if (items.error || ticks.error) return null;
  const byItem = ticksByItem(ticks.data);
  return parseRoutineItems(items.data).map((item) => ({ ...item, ticks: byItem.get(item.id) ?? [] }));
}

type Client = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

// The routine a check-in card starts from (routine-live; the app's migration 038), read through
// RLS: the items that can be ticked on the day (started on or before it) and the day's ticks.
// null: off here, or either read failed. Then the row isn't shown at all: a row with nothing
// ticked could clear ticks it never saw when the person saves (as the tags).
export async function readCardRoutine(supabase: Client, date: string): Promise<{ routine: { items: { id: string; name: string }[]; ticks: string[] } | null }> {
  if (pageGate("routine-live") === "hidden") return { routine: null };
  const [items, ticks] = await Promise.all([
    supabase.from("routine_items").select(ROUTINE_ITEM_COLUMNS).order("position"),
    supabase.from("routine_ticks").select("item_id").eq("local_date", date),
  ]);
  if (items.error || ticks.error) return { routine: null };
  const tickable = tickableOn(parseRoutineItems(items.data), date);
  return { routine: { items: tickable.map(({ id, name }) => ({ id, name })), ticks: ticksForDay(ticks.data, tickable) } };
}
