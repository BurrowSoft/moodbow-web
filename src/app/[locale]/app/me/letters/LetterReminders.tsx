"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { headsUpFits, MAX_HEADS_UPS, QUICK_DAYS, type LetterReminder } from "@/lib/journal/letterReminders";

// The letter editor's Reminders (Vitor, 14 Nov): on the day (on by default, 09:00) and up to 3
// heads-ups before it, each with its days, its own time and an on/off, and × to remove. The web
// schedules nothing: the app on the person's phone does, from what's saved with the letter.
const field = "rounded-xl border border-border bg-surface px-[8px] py-[6px] text-text";

export function LetterReminders({ value, onChange, today, opens }: { value: LetterReminder[]; onChange: (next: LetterReminder[]) => void; today: string; opens: string }) {
  const t = useTranslations("letters");
  // A typed number applies when the field is left; one that doesn't fit (taken, or on or before
  // today) goes back to what it was, and the line under it says why (the Reviewer, #319).
  const [misfit, setMisfit] = useState(false);
  const day = value.find((r) => r.days_before === 0) ?? { days_before: 0, time: "09:00", on: true };
  const heads = value.filter((r) => r.days_before > 0);
  const set = (next: LetterReminder[]) => onChange([...next].sort((a, b) => a.days_before - b.days_before));
  const others = (days: number) => value.filter((r) => r.days_before !== days);
  const update = (days: number, patch: Partial<LetterReminder>) => set(value.map((r) => (r.days_before === days ? { ...r, ...patch } : r)));
  // A heads-up's first choice: the first quick one that fits and isn't taken.
  const free = QUICK_DAYS.find((d) => headsUpFits(d, today, opens) && !value.some((r) => r.days_before === d));
  const daysLabel = (n: number) => (n === 1 ? t("remindersDay") : n === 7 ? t("remindersWeek") : n === 30 ? t("remindersMonth") : t("remindersDays", { n }));

  return (
    <fieldset data-testid="letter-reminders" className="flex flex-col gap-3">
      <legend className="mb-1 font-medium text-text">{t("remindersTitle")}</legend>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2 text-text">
          <input type="checkbox" checked={day.on} onChange={(e) => update(0, { on: e.target.checked })} data-testid="letter-reminder-day-on" />
          {t("remindersOnTheDay")}
        </label>
        <input type="time" aria-label={t("remindersTimeFor", { when: t("remindersOnTheDay") })} value={day.time} onChange={(e) => e.target.value && update(0, { time: e.target.value })} data-testid="letter-reminder-day-time" className={field} />
      </div>
      {heads.map((r) => (
        <div key={r.days_before} data-testid="letter-reminder" className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2 text-text">
            <input type="checkbox" checked={r.on} onChange={(e) => update(r.days_before, { on: e.target.checked })} aria-label={t("remindersOnFor", { when: daysLabel(r.days_before) })} data-testid="letter-reminder-on" />
          </label>
          <input
            key={r.days_before}
            type="number"
            min={1}
            max={Math.max(1, Math.min(366, Math.round((Date.parse(`${opens}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) - 1))}
            defaultValue={r.days_before}
            aria-label={t("remindersDaysBefore")}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (n === r.days_before) return;
              if (headsUpFits(n, today, opens) && !others(r.days_before).some((o) => o.days_before === n)) {
                setMisfit(false);
                set([...others(r.days_before), { ...r, days_before: n }]);
              } else {
                e.target.value = String(r.days_before);
                setMisfit(true);
              }
            }}
            data-testid="letter-reminder-days"
            className={`${field} w-[5em]`}
          />
          <span className="text-text">{daysLabel(r.days_before)}</span>
          <input type="time" aria-label={t("remindersTimeFor", { when: daysLabel(r.days_before) })} value={r.time} onChange={(e) => e.target.value && update(r.days_before, { time: e.target.value })} data-testid="letter-reminder-time" className={field} />
          <button type="button" aria-label={t("remindersRemove", { when: daysLabel(r.days_before) })} onClick={() => set(others(r.days_before))} data-testid="letter-reminder-remove" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
      {heads.length < MAX_HEADS_UPS && free !== undefined && (
        <button type="button" onClick={() => set([...value, { days_before: free, time: day.time, on: true }])} data-testid="letter-reminder-add" className="inline-flex min-h-11 w-fit items-center font-medium text-accent underline underline-offset-4">
          {t("remindersAdd")}
        </button>
      )}
      {misfit && (
        <p role="alert" data-testid="letter-reminder-misfit" className="text-sm text-text">
          {t("remindersInvalid")}
        </p>
      )}
      <p className="text-sm text-muted">{t("remindersApp")}</p>
    </fieldset>
  );
}
