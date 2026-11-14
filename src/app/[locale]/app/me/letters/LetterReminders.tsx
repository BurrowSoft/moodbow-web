"use client";

import { useTranslations } from "next-intl";
import { headsUpFits, MAX_HEADS_UPS, QUICK_DAYS, type LetterReminder } from "@/lib/journal/letterReminders";

// The letter editor's Reminders (Vitor, 14 Nov; storybook boards 26/26b v54, spec "Letter reminders:
// the row"): a white card; each row its label, its time (a pill), an on/off switch at the end and,
// for a heads-up, × to remove. On the day is on by default at 09:00. A heads-up's label (with ▾)
// chooses 1 day, 1 week, 2 weeks or 1 month before; choices that wouldn't fit (on or before today)
// or are already used aren't offered. Add picks the first free choice that fits, and goes at 3 or
// when none fits. The web schedules nothing: the app on the person's phone does, from what's saved.
// min-w-0 / max-w-full: a time field never pushes past the row at large text (it wraps, then shrinks).
const pill = "min-h-9 min-w-0 max-w-full rounded-[10px] bg-pill px-[12px] text-sm font-medium text-text";

function Switch({ on, label, onChange, testId }: { on: boolean; label: string; onChange: (on: boolean) => void; testId: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      data-testid={testId}
      onClick={() => onChange(!on)}
      className="inline-flex h-11 w-12 shrink-0 items-center justify-center"
    >
      <span aria-hidden="true" className={`relative block h-[26px] w-[44px] rounded-full ${on ? "bg-accent" : "bg-border"}`}>
        <span className={`absolute top-[3px] block h-5 w-5 rounded-full bg-surface ${on ? "right-[3px]" : "left-[3px]"}`} />
      </span>
    </button>
  );
}

export function LetterReminders({ value, onChange, today, opens }: { value: LetterReminder[]; onChange: (next: LetterReminder[]) => void; today: string; opens: string }) {
  const t = useTranslations("letters");
  const day = value.find((r) => r.days_before === 0) ?? { days_before: 0, time: "09:00", on: true };
  // Furthest first (1 month before … 1 day before), then On the day last (UX, board 26b v58).
  const heads = value.filter((r) => r.days_before > 0).sort((a, b) => b.days_before - a.days_before);
  const set = (next: LetterReminder[]) => onChange([...next].sort((a, b) => a.days_before - b.days_before));
  const others = (days: number) => value.filter((r) => r.days_before !== days);
  const update = (days: number, patch: Partial<LetterReminder>) => set(value.map((r) => (r.days_before === days ? { ...r, ...patch } : r)));
  const fits = (d: number) => headsUpFits(d, today, opens);
  // Add's choice: the first that fits and isn't used.
  const free = QUICK_DAYS.find((d) => fits(d) && !value.some((r) => r.days_before === d));
  const daysLabel = (n: number) =>
    n === 1 ? t("remindersDay") : n === 7 ? t("remindersWeek") : n === 14 ? t("remindersTwoWeeks") : n === 30 ? t("remindersMonth") : t("remindersDays", { n });

  return (
    <fieldset data-testid="letter-reminders" className="flex flex-col rounded-2xl border border-border bg-surface px-[16px] pt-[8px] pb-[12px]">
      <legend className="sr-only">{t("remindersTitle")}</legend>
      <p aria-hidden="true" className="pt-[8px] pb-[2px] font-medium text-text">
        {t("remindersTitle")}
      </p>
      {heads.map((r) => {
        // The choices: those that fit and aren't another row's, and always this row's own (so a
        // shorter Open it shows what's there, and Save says why it can't go).
        const choices = [...new Set([...QUICK_DAYS.filter((d) => d === r.days_before || (fits(d) && !others(r.days_before).some((o) => o.days_before === d))), r.days_before])].sort((a, b) => a - b);
        return (
          <div key={r.days_before} data-testid="letter-reminder" className="flex min-h-12 flex-wrap items-center gap-x-[10px]">
            <label className="relative flex min-h-11 min-w-0 flex-1 items-center text-sm text-text">
              <span className="sr-only">{t("remindersDaysBefore")}</span>
              <select
                value={r.days_before}
                onChange={(e) => set([...others(r.days_before), { ...r, days_before: Number(e.target.value) }])}
                data-testid="letter-reminder-days"
                className="min-h-11 w-full min-w-0 cursor-pointer appearance-none bg-transparent pe-[20px] text-sm text-text [overflow-wrap:anywhere]"
              >
                {choices.map((d) => (
                  <option key={d} value={d}>
                    {daysLabel(d)}
                  </option>
                ))}
              </select>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="pointer-events-none absolute end-0 text-muted">
                <path d="M6 9l6 7 6-7z" />
              </svg>
            </label>
            <input type="time" aria-label={t("remindersTimeFor", { when: daysLabel(r.days_before) })} value={r.time} onChange={(e) => e.target.value && update(r.days_before, { time: e.target.value })} data-testid="letter-reminder-time" className={pill} />
            <Switch on={r.on} label={t("remindersOnFor", { when: daysLabel(r.days_before) })} onChange={(on) => update(r.days_before, { on })} testId="letter-reminder-on" />
            <button type="button" aria-label={t("remindersRemove", { when: daysLabel(r.days_before) })} onClick={() => set(others(r.days_before))} data-testid="letter-reminder-remove" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        );
      })}
      <div className="flex min-h-12 flex-wrap items-center gap-x-[10px]">
        <span className="min-w-0 flex-1 text-sm text-text">{t("remindersOnTheDay")}</span>
        <input type="time" aria-label={t("remindersTimeFor", { when: t("remindersOnTheDay") })} value={day.time} onChange={(e) => e.target.value && update(0, { time: e.target.value })} data-testid="letter-reminder-day-time" className={pill} />
        <Switch on={day.on} label={t("remindersOnFor", { when: t("remindersOnTheDay") })} onChange={(on) => update(0, { on })} testId="letter-reminder-day-on" />
        <span aria-hidden="true" className="w-11 shrink-0" />
      </div>
      {heads.length < MAX_HEADS_UPS && free !== undefined && (
        <button type="button" onClick={() => set([...value, { days_before: free, time: day.time, on: true }])} data-testid="letter-reminder-add" className="inline-flex min-h-11 w-fit items-center gap-[6px] text-sm font-medium text-accent">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t("remindersAdd")}
        </button>
      )}
      <p className="text-xs text-muted">{t("remindersApp")}</p>
    </fieldset>
  );
}
