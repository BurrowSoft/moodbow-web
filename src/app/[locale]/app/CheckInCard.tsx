"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { EXERCISE_MINUTES, MOODS, SLEEP_HOURS, SLEEP_QUALITIES, STRESS_LEVELS, type CheckIn, type SleepQuality } from "@/lib/journal/checkIn";
import { dateLine } from "@/lib/journal/today";
import { localKey } from "@/lib/localData";
import { saveCheckIn, type CheckInState } from "./actions";

// The daily check-in (M4): mood required (5 labelled circles), then the
// optional sleep / exercise / stress rows. After saving, a summary row with
// Edit. Offline: the card keeps a pending copy per user in this browser and
// sends it when the browser is back online (checkinSavedOfflineWeb).
type Fields = { mood: number | null; sleepHours: string; sleepQuality: SleepQuality | ""; exercise: string; stress: string };

const fromRow = (row: CheckIn | null): Fields => ({
  mood: row?.mood ?? null,
  sleepHours: row?.sleep_hours != null ? String(row.sleep_hours) : "",
  sleepQuality: row?.sleep_quality ?? "",
  exercise: row?.exercise_minutes != null ? String(row.exercise_minutes) : "",
  stress: row?.stress != null ? String(row.stress) : "",
});

const MOOD_COLOURS = ["bg-[#9b84d6]", "bg-[#b9a3e3]", "bg-[#e3c0d0]", "bg-[#f2a07b]", "bg-[#e27d9a]"];
const pendingKey = (uid: string) => localKey("pending-checkin", uid);

// The pending copy names its own day: synced after midnight, it must still
// land on the day it was made, not on the new today.
type Pending = { fields: Fields; expected: string; date: string };

function readPending(uid: string): Pending | null {
  try {
    const p = JSON.parse(window.localStorage.getItem(pendingKey(uid)) ?? "null") as Pending | null;
    return p && typeof p.date === "string" && typeof p.expected === "string" && typeof p.fields?.mood === "number" ? p : null;
  } catch {
    return null;
  }
}

function removePending(uid: string) {
  try {
    window.localStorage.removeItem(pendingKey(uid));
  } catch {
    // storage unavailable
  }
}

// The pending copy for a save whose request failed (the inverse of toFormData).
function pendingFromForm(form: FormData): Pending {
  const text = (name: string) => String(form.get(name) ?? "");
  return {
    fields: {
      mood: Number(text("mood")),
      sleepHours: text("sleep_hours"),
      sleepQuality: text("sleep_quality") as SleepQuality | "",
      exercise: text("exercise_minutes"),
      stress: text("stress"),
    },
    expected: text("expected_updated_at"),
    date: text("local_date"),
  };
}

function toFormData(fields: Fields, expectedUpdatedAt: string, date: string, fromPending = false): FormData {
  const form = new FormData();
  form.set("local_date", date);
  form.set("mood", String(fields.mood ?? ""));
  form.set("sleep_hours", fields.sleepHours);
  form.set("sleep_quality", fields.sleepQuality);
  form.set("exercise_minutes", fields.exercise);
  form.set("stress", fields.stress);
  form.set("expected_updated_at", expectedUpdatedAt);
  if (fromPending) form.set("from_pending", "1");
  return form;
}

type Props = { initial: CheckIn | null; uid: string; today: string; dateLocaleTag: string };

export function CheckInCard(props: Props) {
  const t = useTranslations("today");
  const [superseded, setSuperseded] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {superseded && (
        <div role="status" data-testid="checkin-superseded" className="flex items-start gap-4 rounded-2xl bg-pill p-4 text-sm text-text">
          <p className="flex-1">{t("offlineCheckinSuperseded", { date: dateLine(superseded, props.dateLocaleTag) })}</p>
          <button type="button" data-testid="checkin-superseded-dismiss" onClick={() => setSuperseded(null)} className="font-medium text-accent underline underline-offset-4">
            {t("dismiss")}
          </button>
        </div>
      )}
      <Card {...props} setSuperseded={setSuperseded} />
    </div>
  );
}

function Card({ initial, uid, today, setSuperseded }: Props & { setSuperseded: (date: string) => void }) {
  const t = useTranslations("today");
  const [row, setRow] = useState<CheckIn | null>(initial);
  const [fields, setFields] = useState<Fields>(fromRow(initial));
  const [editing, setEditing] = useState(initial === null);
  const [offline, setOffline] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const flushing = useRef(false);
  const [state, action, pending] = useActionState<CheckInState, FormData>(async (prev, form) => {
    let next: CheckInState;
    try {
      next = await saveCheckIn(prev, form);
    } catch (e) {
      // A redirect (consent, sign-in) is the navigation itself.
      const fromPending = form.get("from_pending") === "1";
      if (fromPending) flushing.current = false;
      const digest = (e as { digest?: unknown })?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
        // Leaving for sign-in or Consent before this was saved: keep it as a
        // pending copy first, so it syncs once they're back (decision 81).
        if (!fromPending) {
          try {
            window.localStorage.setItem(pendingKey(uid), JSON.stringify(pendingFromForm(form)));
          } catch {
            // storage unavailable: nothing more can be done before leaving
          }
        }
        throw e;
      }
      // The request itself failed (the connection dropped while the browser
      // still says online): not a crash. A synced copy simply stays for the
      // next reconnect; a live save becomes one, exactly like saving offline.
      if (fromPending) return prev;
      try {
        window.localStorage.setItem(pendingKey(uid), JSON.stringify(pendingFromForm(form)));
      } catch {
        return { status: "error", error: "generic" };
      }
      setOffline(true);
      setEditing(false);
      return prev;
    }
    if (form.get("from_pending") === "1") {
      flushing.current = false;
      // The copy is removed only once it's answered, and kept while a retry
      // can still succeed ("generic", e.g. the network dropped again). A
      // redirect (consent, sign-in) throws before this line: the copy stays.
      if (next.status === "saved" || (next.status === "error" && next.error !== "generic")) removePending(uid);
      const date = String(form.get("local_date"));
      // The day changed on another device meanwhile: the copy is dropped, but
      // never silently (decision 72). Today's card shows the latest version.
      if (next.status === "error" && next.error === "stale") {
        setSuperseded(date);
        if (date === today && next.checkIn) {
          setRow(next.checkIn);
          setFields(fromRow(next.checkIn));
          setEditing(false);
          setOffline(false);
        }
        return prev;
      }
      // A copy from an earlier day doesn't change today's card.
      if (date !== today) return prev;
    }
    if (next.status === "saved") {
      setRow(next.checkIn);
      setFields(fromRow(next.checkIn));
      setEditing(false);
      setOffline(false);
    } else if (next.status === "error" && next.error === "stale" && next.checkIn) {
      setRow(next.checkIn);
      setFields(fromRow(next.checkIn));
    }
    return next;
  }, { status: "idle" });

  // Send a check-in saved while offline once the browser is online again.
  useEffect(() => {
    const flush = () => {
      if (flushing.current || !navigator.onLine) return;
      const saved = readPending(uid);
      if (!saved) return;
      flushing.current = true;
      startTransition(() => action(toFormData(saved.fields, saved.expected, saved.date, true)));
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [action, uid]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (fields.mood === null) return;
    const expected = row?.updated_at ?? "";
    setStorageFailed(false);
    if (!navigator.onLine) {
      try {
        window.localStorage.setItem(pendingKey(uid), JSON.stringify({ fields, expected, date: today } satisfies Pending));
      } catch {
        // storage unavailable: nothing was kept, so don't say it was saved
        setStorageFailed(true);
        return;
      }
      setOffline(true);
      setEditing(false);
      return;
    }
    startTransition(() => action(toFormData(fields, expected, today)));
  };

  const set = (patch: Partial<Fields>) => setFields((f) => ({ ...f, ...patch }));
  const chip = (active: boolean) =>
    `min-h-11 rounded-full border px-4 text-sm font-medium ${active ? "border-accent bg-pill text-accent" : "border-border text-text hover:bg-pill"}`;
  const errorKey = storageFailed
    ? "errGeneric"
    : state.status === "error"
      ? state.error === "dateInFuture"
        ? "errDateInFuture"
        : state.error === "stale"
          ? "errStaleWrite"
          : "errGeneric"
      : null;

  if (!editing && fields.mood !== null) {
    const summary = [
      t(`mood${fields.mood}` as "mood1"),
      fields.sleepHours !== "" ? t("sleepHours", { hours: Number(fields.sleepHours) }) : null,
      fields.sleepQuality ? t(`sleep${fields.sleepQuality[0].toUpperCase()}${fields.sleepQuality.slice(1)}` as "sleepPoor") : null,
      fields.exercise !== "" ? (fields.exercise === "0" ? t("exerciseNone") : fields.exercise === "90" ? t("exercise90") : t("exerciseMinutes", { minutes: Number(fields.exercise) })) : null,
      fields.stress !== "" ? t("stressChip", { level: Number(fields.stress) }) : null,
    ].filter(Boolean);
    return (
      <section className="rounded-3xl border border-border bg-surface p-6" data-testid="checkin-summary">
        <h2 className="text-lg font-medium text-text">{t("checkinTitle")}</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {summary.map((label) => (
            <li key={label} className="rounded-full bg-pill px-3 py-1 text-sm text-text">
              {label}
            </li>
          ))}
        </ul>
        <p role="status" className="mt-3 text-sm text-muted" data-testid="checkin-status">
          {offline ? t("checkinSavedOfflineWeb") : t("checkinSaved")}
        </p>
        <button type="button" data-testid="checkin-edit" onClick={() => setEditing(true)} className="mt-4 font-medium text-accent underline underline-offset-4">
          {t("checkinEdit")}
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-border bg-surface p-6" data-testid="checkin-card">
      <fieldset>
        <legend className="text-lg font-medium text-text">{t("checkinTitle")}</legend>
        <div className="mt-4 grid grid-cols-5 gap-2" role="radiogroup" aria-label={t("checkinTitle")}>
          {MOODS.map((mood) => (
            <button
              key={mood}
              type="button"
              role="radio"
              aria-checked={fields.mood === mood}
              data-testid={`checkin-mood-${mood}`}
              onClick={() => set({ mood })}
              className={`flex flex-col items-center gap-2 rounded-2xl p-2 text-xs font-medium ${fields.mood === mood ? "bg-pill text-accent" : "text-muted hover:bg-pill"}`}
            >
              <span className={`h-9 w-9 rounded-full ${MOOD_COLOURS[mood - 1]} ${fields.mood === mood ? "ring-2 ring-accent ring-offset-2" : ""}`} aria-hidden="true" />
              {t(`mood${mood}` as "mood1")}
            </button>
          ))}
        </div>
      </fieldset>

      {fields.mood !== null && (
        <div className="mt-6 space-y-6">
          <fieldset>
            <legend className="text-sm font-medium text-text">
              {t("sleepTitle")} <span className="font-normal text-muted">· {t("optional")}</span>
            </legend>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                aria-label={t("sleepTitle")}
                data-testid="checkin-sleep-hours"
                value={fields.sleepHours}
                onChange={(e) => set({ sleepHours: e.target.value })}
                className="min-h-11 rounded-full border border-border bg-bg px-4 text-sm text-text"
              >
                <option value="">{t("optional")}</option>
                {SLEEP_HOURS.map((h) => (
                  <option key={h} value={String(h)}>
                    {t("sleepHours", { hours: h })}
                  </option>
                ))}
              </select>
              {SLEEP_QUALITIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  aria-pressed={fields.sleepQuality === q}
                  data-testid={`checkin-sleep-quality-${q}`}
                  onClick={() => set({ sleepQuality: fields.sleepQuality === q ? "" : q })}
                  className={chip(fields.sleepQuality === q)}
                >
                  {t(`sleep${q[0].toUpperCase()}${q.slice(1)}` as "sleepPoor")}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-text">
              {t("exerciseTitle")} <span className="font-normal text-muted">· {t("optional")}</span>
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXERCISE_MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={fields.exercise === String(m)}
                  data-testid={`checkin-exercise-${m}`}
                  onClick={() => set({ exercise: fields.exercise === String(m) ? "" : String(m) })}
                  className={chip(fields.exercise === String(m))}
                >
                  {m === 0 ? t("exerciseNone") : m === 90 ? t("exercise90") : t("exerciseMinutes", { minutes: m })}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-text">
              {t("stressTitle")} <span className="font-normal text-muted">· {t("optional")}</span>
            </legend>
            <div className="mt-2 flex items-start gap-2">
              {STRESS_LEVELS.map((s) => (
                <div key={s} className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={fields.stress === String(s)}
                    data-testid={`checkin-stress-${s}`}
                    onClick={() => set({ stress: fields.stress === String(s) ? "" : String(s) })}
                    className={`${chip(fields.stress === String(s))} w-11 px-0`}
                  >
                    {s}
                  </button>
                  <span className="h-4 text-xs text-muted">{s === 1 ? t("stressLow") : s === 5 ? t("stressHigh") : ""}</span>
                </div>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {errorKey && (
        <p role="alert" data-testid="checkin-error" className="mt-4 font-medium text-accent">
          {t(errorKey)}
        </p>
      )}
      <button
        type="submit"
        data-testid="checkin-save"
        disabled={fields.mood === null || pending}
        className="mt-6 inline-flex min-h-12 min-w-[160px] items-center justify-center rounded-full bg-accent px-8 font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
      >
        {t("checkinSave")}
      </button>
    </form>
  );
}
