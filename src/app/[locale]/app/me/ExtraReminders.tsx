"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LockedItem, PlusLock, type PlusOffer } from "../PlusSheet";
import { saveExtraReminders } from "./actions";
import { checkExtraTimes, EXTRA_REMINDERS, type ExtraReminderError } from "@/lib/journal/extraReminders";

// Moodbow Plus: more daily reminders (specs/plus-more-reminders.md, UX 12 Nov), inside Me →
// Daily reminder. With Plus: up to 2 more times, an hour from every other, each with Remove,
// and Add another time. Without Plus: Add another time is the lock (the Plus sheet, only
// here); times kept from an earlier Plus stay listed, locked, and can still be removed (the
// phone doesn't send them). The main switch off: nothing here can change but Remove.
// Like the main reminder, a failed save puts the list back to what the account has.

export type ExtraMode = { kind: "plus" } | { kind: "locked"; offer: PlusOffer };

const FIELD = "block min-w-0 max-w-full rounded-2xl border border-border bg-bg px-[16px] py-3 text-text [font-size:min(1rem,max(10vw,32px))] disabled:opacity-50";
const SMALL = "min-h-11 rounded-full border border-border px-4 text-sm font-medium text-text disabled:opacity-50";

export function timeLabel(hhmm: string, locale: string): string {
  const tag = locale === "pt-br" ? "pt-BR" : locale;
  const at = new Date(Date.UTC(1970, 0, 1, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5))));
  return new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(at);
}

export function ExtraReminders({
  mode,
  on,
  mainTime,
  times,
  setTimes,
}: {
  mode: ExtraMode;
  on: boolean;
  mainTime: string;
  times: string[];
  setTimes: (next: string[]) => void;
}) {
  const t = useTranslations("me");
  const tt = useTranslations("today");
  const tp = useTranslations("plus");
  const locale = useLocale();
  const base = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<"saved" | ExtraReminderError | "generic" | null>(null);
  const [pending, startTransition] = useTransition();
  // What the inputs show while typing; reset to the account's list after each save.
  const [shown, setShown] = useState<Record<number, string>>({});
  const draftRef = useRef<HTMLInputElement>(null);

  const send = (next: string[]) => {
    const problem = checkExtraTimes(next, mainTime);
    // Removing never needs a check: a shorter list is always allowed.
    if (problem && next.length >= times.length) {
      setStatus(problem);
      setShown({});
      return;
    }
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveExtraReminders>>;
      try {
        result = await saveExtraReminders(next);
      } catch (e) {
        if (typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")) throw e;
        result = { ok: false, error: "generic" };
      }
      setShown({});
      if (result.ok) {
        setTimes(result.times);
        setDraft(null);
        setStatus("saved");
      } else {
        setStatus(result.error);
      }
    });
  };

  const message =
    status === "saved" ? tt("checkinSaved") : status === "too_close" ? t("reminderTooClose") : status === "too_many" ? t("reminderMax") : status ? tt("errGeneric") : null;
  const full = times.length >= EXTRA_REMINDERS.maxExtra;
  const plus = mode.kind === "plus";

  return (
    <div data-testid="me-reminder-extra" className="mt-4 space-y-3">
      {times.map((time, i) => (
        <div key={time} className="flex flex-wrap items-end gap-[12px]">
          <div className="min-w-0">
            <label htmlFor={`${base}-${i}`} className="block text-sm font-medium text-text">
              {t("reminderExtraTime")}
            </label>
            {plus ? (
              <input
                id={`${base}-${i}`}
                type="time"
                data-testid="me-reminder-extra-time"
                value={shown[i] ?? time}
                disabled={!on || pending}
                onChange={(e) => setShown({ ...shown, [i]: e.target.value })}
                onBlur={(e) => e.target.value && e.target.value !== time && send(times.map((x) => (x === time ? e.target.value : x)))}
                className={`mt-2 ${FIELD}`}
              />
            ) : (
              <p id={`${base}-${i}`} data-testid="me-reminder-extra-locked" className="mt-2 flex items-center gap-2 text-text">
                {timeLabel(time, locale)}
                <PlusLock />
              </p>
            )}
          </div>
          <button type="button" data-testid="me-reminder-extra-remove" aria-describedby={`${base}-${i}`} disabled={pending} onClick={() => send(times.filter((x) => x !== time))} className={SMALL}>
            {t("reminderRemove")}
          </button>
        </div>
      ))}
      {plus && draft !== null && (
        <div className="flex flex-wrap items-end gap-[12px]">
          <div className="min-w-0">
            <label htmlFor={`${base}-new`} className="block text-sm font-medium text-text">
              {t("reminderExtraTime")}
            </label>
            <input
              ref={draftRef}
              id={`${base}-new`}
              type="time"
              data-testid="me-reminder-extra-new"
              value={draft}
              disabled={!on || pending}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => e.target.value && send([...times, e.target.value])}
              className={`mt-2 ${FIELD}`}
            />
          </div>
          <button type="button" data-testid="me-reminder-extra-discard" aria-describedby={`${base}-new`} disabled={pending} onClick={() => setDraft(null)} className={SMALL}>
            {t("reminderRemove")}
          </button>
        </div>
      )}
      {plus ? (
        full ? (
          <p data-testid="me-reminder-extra-max" className="text-sm text-muted">
            {t("reminderMax")}
          </p>
        ) : (
          draft === null && (
            <button
              type="button"
              data-testid="me-reminder-extra-add"
              disabled={!on || pending}
              onClick={() => {
                setStatus(null);
                setDraft("");
                // The new field takes focus once it's there.
                requestAnimationFrame(() => draftRef.current?.focus());
              }}
              className={SMALL}
            >
              {t("reminderAddTime")}
            </button>
          )
        )
      ) : (
        <LockedItem
          label={t("reminderAddTime")}
          sheetTitle={tp("sheetReminders")}
          offer={mode.offer}
          testId="me-reminder-extra-add-locked"
          className={`inline-flex items-center gap-2 ${SMALL}`}
        />
      )}
      <p role="status" data-testid="me-reminder-extra-status" className="text-sm font-medium text-text">
        {!pending ? message : null}
      </p>
    </div>
  );
}
