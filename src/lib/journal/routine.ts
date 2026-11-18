// Routine (1.4 F; the app's migration 038, plans/PLAN-routine.md): up to 3 items the person ticks
// per day in the check-in. The server's rules, checked here first so a bad value never leaves the
// page; the functions check them again.
// - A name is trimmed with inner whitespace collapsed, 1 to 40 characters (char_length: code
//   points), never two that differ only in case.
// - A tick needs that day's check-in and a day on or after the item's started_on.
export const ROUTINE_RULES = { maxItems: 3, maxChars: 40 } as const;

export type RoutineItemRow = { id: string; name: string; position: number; in_appointment: boolean; started_on: string };

// The columns the screens read: never user_id, never created_at.
export const ROUTINE_ITEM_COLUMNS = "id, name, position, in_appointment, started_on";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const normalizeRoutineName = (raw: string): string => raw.replace(/\s+/g, " ").trim();
// As the server counts it (char_length): code points, so an emoji is one.
export const routineNameLength = (raw: string): number => [...normalizeRoutineName(raw)].length;

export type RoutineProblem = "empty" | "tooLong" | "full" | "duplicate";
// others: the person's other items' names (for a rename, without the one being renamed).
export function routineNameProblem(raw: string, others: readonly string[], adding: boolean): RoutineProblem | null {
  const name = normalizeRoutineName(raw);
  if (name === "") return "empty";
  if (routineNameLength(name) > ROUTINE_RULES.maxChars) return "tooLong";
  if (adding && others.length >= ROUTINE_RULES.maxItems) return "full";
  if (others.some((o) => normalizeRoutineName(o).toLowerCase() === name.toLowerCase())) return "duplicate";
  return null;
}

// Rows from routine_items to the list, in position order; anything malformed is dropped.
export function parseRoutineItems(rows: unknown): RoutineItemRow[] {
  return (Array.isArray(rows) ? rows : [])
    .filter(
      (r): r is RoutineItemRow =>
        typeof r?.id === "string" &&
        typeof r?.name === "string" &&
        Number.isInteger(r?.position) &&
        typeof r?.in_appointment === "boolean" &&
        typeof r?.started_on === "string" &&
        ISO_DATE.test(r.started_on),
    )
    .map(({ id, name, position, in_appointment, started_on }) => ({ id, name, position, in_appointment, started_on }))
    .sort((a, b) => a.position - b.position);
}

// One day's ticks (routine_ticks rows for that date) to the item ids, for the items listed only.
export function ticksForDay(rows: unknown, items: readonly RoutineItemRow[]): string[] {
  const known = new Set(items.map((i) => i.id));
  const ids = (Array.isArray(rows) ? rows : []).map((r) => r?.item_id).filter((id): id is string => typeof id === "string" && known.has(id));
  return items.map((i) => i.id).filter((id) => ids.includes(id));
}

// The ticks per item over many days (routine_ticks rows), for patterns and the appointment.
export function ticksByItem(rows: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (typeof r?.item_id !== "string" || typeof r?.local_date !== "string" || !ISO_DATE.test(r.local_date)) continue;
    out.set(r.item_id, [...(out.get(r.item_id) ?? []), r.local_date]);
  }
  for (const days of out.values()) days.sort();
  return out;
}

// The items that can be ticked on a day: started on or before it (a tick before started_on is
// the server's invalid_value).
export const tickableOn = (items: readonly RoutineItemRow[], date: string): RoutineItemRow[] => items.filter((i) => i.started_on <= date);

// The form's hidden "routine" field (JSON: the ticked item ids) back to a clean list, or null when
// it isn't one: the save is refused, as bad tags are. Duplicates count once.
export function parseRoutineTicks(value: FormDataEntryValue | null): string[] | null {
  if (value === null || value === "") return [];
  let list: unknown;
  try {
    list = JSON.parse(String(value));
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.length > ROUTINE_RULES.maxItems * 2 || list.some((id) => typeof id !== "string" || !UUID.test(id))) return null;
  return [...new Set(list as string[])];
}
