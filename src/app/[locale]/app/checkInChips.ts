import type { useTranslations } from "next-intl";
import type { CheckIn } from "@/lib/journal/checkIn";
import { valueHex } from "@/lib/journal/valueColours";

// A check-in's sleep, movement and stress as short chips ("7 h", "30 min",
// "Stress 2/5"), the ones it has, each with its value's Sunrise colour
// (decision 150; null for a rest day): the entry view's strip (decision 161).
export type CheckInChip = { label: string; hex: string | null };
export function checkInChips(c: Pick<CheckIn, "sleep_hours" | "exercise_minutes" | "stress">, tt: ReturnType<typeof useTranslations<"today">>): CheckInChip[] {
  return [
    c.sleep_hours != null ? { label: tt("sleepHours", { hours: Number(c.sleep_hours) }), hex: valueHex("sleep_hours", c.sleep_hours) } : null,
    c.exercise_minutes != null
      ? {
          label: c.exercise_minutes === 0 ? tt("exerciseNone") : c.exercise_minutes === 90 ? tt("exercise90") : tt("exerciseMinutes", { minutes: c.exercise_minutes }),
          hex: valueHex("exercise_minutes", c.exercise_minutes),
        }
      : null,
    c.stress != null ? { label: tt("stressChip", { level: c.stress }), hex: valueHex("stress", c.stress) } : null,
  ].filter((x): x is CheckInChip => x !== null);
}
