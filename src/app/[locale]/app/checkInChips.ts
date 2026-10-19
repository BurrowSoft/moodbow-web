import type { useTranslations } from "next-intl";
import type { CheckIn } from "@/lib/journal/checkIn";

// A check-in's sleep, movement and stress as short chips ("7 h", "30 min",
// "Stress 2/5"), the ones it has: the Timeline's days and the entry view's
// strip (decision 151).
export function checkInChips(c: Pick<CheckIn, "sleep_hours" | "exercise_minutes" | "stress">, tt: ReturnType<typeof useTranslations<"today">>): string[] {
  return [
    c.sleep_hours != null ? tt("sleepHours", { hours: Number(c.sleep_hours) }) : null,
    c.exercise_minutes != null
      ? c.exercise_minutes === 0
        ? tt("exerciseNone")
        : c.exercise_minutes === 90
          ? tt("exercise90")
          : tt("exerciseMinutes", { minutes: c.exercise_minutes })
      : null,
    c.stress != null ? tt("stressChip", { level: c.stress }) : null,
  ].filter((x): x is string => x !== null);
}
