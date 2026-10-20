"use client";

import { startTransition, useActionState, useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { EXERCISE_MINUTES, MOODS, SLEEP_HOURS, SLEEP_QUALITIES, SLEEP_START, STRESS_LEVELS, type CheckIn, type SleepQuality } from "@/lib/journal/checkIn";
import { dateLine } from "@/lib/journal/today";
import { valueHex } from "@/lib/journal/valueColours";
import { localKey } from "@/lib/localData";
import { ValueDot } from "@/components/ValueDot";
import { JOURNAL_CARD, MOOD_FACE, MOOD_LABEL, MOOD_ROW, PRIMARY_SAVE } from "@/lib/ui/journalLayout";
import { MoodFace } from "@/components/MoodFace";
import { onArrival } from "@/lib/ui/arrival";
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

// One pending copy per user per day (UX): saving offline on two days keeps
// both, a later save for the same day replaces only that day's, and every
// pending day syncs on reconnect (decision 72: never a silent drop).
const pendingKey = (uid: string, date: string) => localKey("pending-checkin", uid, date);

// The pending copy names its own day: synced after midnight, it must still
// land on the day it was made, not on the new today.
type Pending = { fields: Fields; expected: string; date: string };

const isPending = (p: Pending | null): p is Pending =>
  !!p && typeof p.date === "string" && typeof p.expected === "string" && typeof p.fields?.mood === "number";

// Every pending copy of this user, oldest day first. Also reads the
// one-per-user key from before per-day copies (mb:pending-checkin:<uid>).
function readAllPending(uid: string): { key: string; pending: Pending }[] {
  const legacy = localKey("pending-checkin", uid);
  const found: { key: string; pending: Pending }[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || (key !== legacy && !key.startsWith(`${legacy}:`))) continue;
      try {
        const p = JSON.parse(window.localStorage.getItem(key) ?? "null") as Pending | null;
        if (isPending(p)) found.push({ key, pending: p });
      } catch {
        // a corrupt copy is ignored
      }
    }
  } catch {
    // storage unavailable
  }
  return found.sort((a, b) => a.pending.date.localeCompare(b.pending.date));
}

function removePending(key: string) {
  try {
    window.localStorage.removeItem(key);
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

function toFormData(fields: Fields, expectedUpdatedAt: string, date: string, fromPending?: string): FormData {
  const form = new FormData();
  form.set("local_date", date);
  form.set("mood", String(fields.mood ?? ""));
  form.set("sleep_hours", fields.sleepHours);
  form.set("sleep_quality", fields.sleepQuality);
  form.set("exercise_minutes", fields.exercise);
  form.set("stress", fields.stress);
  form.set("expected_updated_at", expectedUpdatedAt);
  // from_pending tells the action it's a synced copy; pending_key which one
  // to remove once it's answered.
  if (fromPending) {
    form.set("from_pending", "1");
    form.set("pending_key", fromPending);
  }
  return form;
}

// date: the day this card is for (today on Today, the day in the day view).
// autoFocus: focus the first mood when the card opens ("Add a check-in").
type Props = { initial: CheckIn | null; uid: string; date: string; dateLocaleTag: string; autoFocus?: boolean };

// What became of an offline copy that couldn't be saved as it was: another
// device changed that day ("superseded"), or the server refused it
// ("rejected": e.g. a day that is in the future for the account's zone).
// Never silent (decision 72): one notice per day, until dismissed.
type Notice = { date: string; kind: "superseded" | "rejected" };
type Notify = (notice: Notice) => void;

// The sleep stepper's − and +: round icon buttons, ≥ 44 px targets.
const STEP_BUTTON = "inline-flex h-11 w-11 items-center justify-center rounded-full text-accent hover:bg-pill";
function StepIcon({ plus }: { plus: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d={plus ? "M8 12h8M12 8v8" : "M8 12h8"} />
    </svg>
  );
}

export function CheckInCard(props: Props) {
  const t = useTranslations("today");
  const [notices, setNotices] = useState<Notice[]>([]);
  // One live region, always mounted, so a save is announced (a region
  // that appears together with its text often isn't; a11y pass).
  const [announcement, setAnnouncement] = useState("");
  const notify = useCallback<Notify>(
    (notice) => setNotices((shown) => (shown.some((n) => n.date === notice.date && n.kind === notice.kind) ? shown : [...shown, notice])),
    [],
  );
  // Dismissing a notice removes the focused button: focus the card instead.
  const wrapper = useRef<HTMLDivElement>(null);
  return (
    <div ref={wrapper} tabIndex={-1} className="space-y-4 outline-none">
      {/* One region, always there, so each notice is announced as it comes. */}
      <div role="status" className="space-y-4 empty:hidden" data-testid="checkin-notices">
      {notices.map((notice) => (
        <div
          key={`${notice.kind}-${notice.date}`}
          data-testid={`checkin-${notice.kind}`}
          className="flex items-start gap-4 rounded-2xl bg-pill p-4 text-sm text-text"
        >
          <p className="flex-1">
            {t(notice.kind === "superseded" ? "offlineCheckinSuperseded" : "offlineCheckinRejected", { date: dateLine(notice.date, props.dateLocaleTag) })}
          </p>
          <button
            type="button"
            data-testid={`checkin-${notice.kind}-dismiss`}
            onClick={() => {
              setNotices((shown) => shown.filter((n) => n !== notice));
              wrapper.current?.focus();
            }}
            className="font-medium text-accent underline underline-offset-4"
          >
            {t("dismiss")}
          </button>
        </div>
      ))}
      </div>
      <p role="status" className="sr-only" data-testid="checkin-announce">
        {announcement}
      </p>
      <Card {...props} notify={notify} announce={setAnnouncement} />
    </div>
  );
}

function Card({ initial, uid, date: cardDate, notify, announce, autoFocus }: Props & { notify: Notify; announce: (text: string) => void }) {
  const t = useTranslations("today");
  const [row, setRow] = useState<CheckIn | null>(initial);
  const [fields, setFields] = useState<Fields>(fromRow(initial));
  const [editing, setEditing] = useState(initial === null);
  const [offline, setOffline] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  // The pending copies being sent right now (by key), so none goes twice.
  const flushing = useRef(new Set<string>());
  const [state, action, pending] = useActionState<CheckInState, FormData>(async (prev, form) => {
    let next: CheckInState;
    try {
      next = await saveCheckIn(prev, form);
    } catch (e) {
      // A redirect (consent, sign-in) is the navigation itself.
      const fromPending = form.get("from_pending") === "1";
      if (fromPending) flushing.current.delete(String(form.get("pending_key")));
      const digest = (e as { digest?: unknown })?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
        // Leaving for sign-in or Consent before this was saved: keep it as a
        // pending copy first, so it syncs once they're back (decision 81).
        if (!fromPending) {
          try {
            const copy = pendingFromForm(form);
            window.localStorage.setItem(pendingKey(uid, copy.date), JSON.stringify(copy));
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
        const copy = pendingFromForm(form);
        window.localStorage.setItem(pendingKey(uid, copy.date), JSON.stringify(copy));
      } catch {
        return { status: "error", error: "generic" };
      }
      setOffline(true);
      setEditing(false);
      return prev;
    }
    if (form.get("from_pending") === "1") {
      const key = String(form.get("pending_key"));
      flushing.current.delete(key);
      // The copy is removed only once it's answered, and kept while a retry
      // can still succeed ("generic", e.g. the network dropped again). A
      // redirect (consent, sign-in) throws before this line: the copy stays.
      if (next.status === "saved" || (next.status === "error" && next.error !== "generic")) removePending(key);
      const date = String(form.get("local_date"));
      // Dropped, but never silently (decision 72).
      if (next.status === "error" && (next.error === "dateInFuture" || next.error === "invalid")) {
        notify({ date, kind: "rejected" });
        return prev;
      }
      // The day changed on another device meanwhile; this card shows the
      // latest version if it's that day's.
      if (next.status === "error" && next.error === "stale") {
        notify({ date, kind: "superseded" });
        if (date === cardDate && next.checkIn) {
          setRow(next.checkIn);
          setFields(fromRow(next.checkIn));
          setEditing(false);
          setOffline(false);
        }
        return prev;
      }
      // A copy for another day doesn't change this card.
      if (date !== cardDate) return prev;
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

  // Send every check-in saved while offline once the browser is online
  // again, oldest day first (React runs the queued saves in order).
  useEffect(() => {
    const flush = () => {
      if (!navigator.onLine) return;
      for (const { key, pending: saved } of readAllPending(uid)) {
        if (flushing.current.has(key)) continue;
        flushing.current.add(key);
        startTransition(() => action(toFormData(saved.fields, saved.expected, saved.date, key)));
      }
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
        window.localStorage.setItem(pendingKey(uid, cardDate), JSON.stringify({ fields, expected, date: cardDate } satisfies Pending));
      } catch {
        // storage unavailable: nothing was kept, so don't say it was saved
        setStorageFailed(true);
        return;
      }
      setOffline(true);
      setEditing(false);
      return;
    }
    startTransition(() => action(toFormData(fields, expected, cardDate)));
  };

  const set = (patch: Partial<Fields>) => setFields((f) => ({ ...f, ...patch }));
  // One step through SLEEP_HOURS (half an hour), stopping at both ends; from
  // empty, either button starts at SLEEP_START (the app).
  const stepSleep = (dir: 1 | -1) =>
    setFields((f) => {
      if (f.sleepHours === "") return { ...f, sleepHours: String(SLEEP_START) };
      const at = SLEEP_HOURS.indexOf(Number(f.sleepHours));
      const next = SLEEP_HOURS[Math.min(SLEEP_HOURS.length - 1, Math.max(0, (at < 0 ? SLEEP_HOURS.indexOf(SLEEP_START) : at) + dir))];
      return { ...f, sleepHours: String(next) };
    });
  const chip = (active: boolean) =>
    `inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium ${active ? "border-accent bg-pill text-accent" : "border-border text-text hover:bg-pill"}`;
  const errorKey = storageFailed
    ? "errGeneric"
    : state.status === "error"
      ? state.error === "dateInFuture"
        ? "errDateInFuture"
        : state.error === "stale"
          ? "errStaleWrite"
          : "errGeneric"
      : null;

  // Arrow keys in the mood group: move to the previous / next face and
  // choose it (the radio pattern), wrapping around.
  const moveMood = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const at = (MOODS as readonly number[]).indexOf(fields.mood ?? MOODS[0]);
    const next = MOODS[(at + step + MOODS.length) % MOODS.length];
    set({ mood: next });
    e.currentTarget.querySelector<HTMLElement>(`[data-testid=checkin-mood-${next}]`)?.focus();
  };

  // Switching between the form and the summary replaces what had focus
  // (Save, Edit): move it to the new view, and say "Saved" (a11y pass).
  const root = useRef<HTMLElement | null>(null);
  const seen = useRef(false);
  const showsSummary = !editing && fields.mood !== null;
  const moodTitle = useId();
  // The "c" shortcut (1.1 O): focus the mood (the chosen face, else the
  // first) or, once checked in, the summary's heading.
  useEffect(
    () =>
      onArrival("checkIn", () => {
        const card = root.current;
        (card?.querySelector<HTMLElement>("[role=radio][tabindex='0']") ?? card?.querySelector<HTMLElement>("h2"))?.focus();
      }),
    [],
  );
  useEffect(() => {
    if (!seen.current) {
      seen.current = true;
      if (autoFocus && !showsSummary) root.current?.querySelector<HTMLElement>("[role=radio]")?.focus();
      return;
    }
    if (showsSummary) {
      announce(offline ? t("checkinSavedOfflineWeb") : t("checkinSaved"));
      root.current?.querySelector<HTMLElement>("h2")?.focus();
    } else {
      announce("");
      const radios = root.current;
      (radios?.querySelector<HTMLElement>("[role=radio][aria-checked=true]") ?? radios?.querySelector<HTMLElement>("[role=radio]"))?.focus();
    }
    // Only on a switch between the two views.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showsSummary]);

  if (showsSummary) {
    // The rest as chips, each stored value with its Sunrise dot (decision
    // 150); sleep quality is words only, and a rest day has no colour.
    const mood = fields.mood as number;
    const chips = [
      fields.sleepHours !== "" ? { label: t("sleepHours", { hours: Number(fields.sleepHours) }), hex: valueHex("sleep_hours", fields.sleepHours) } : null,
      fields.sleepQuality ? { label: t(`sleep${fields.sleepQuality[0].toUpperCase()}${fields.sleepQuality.slice(1)}` as "sleepPoor"), hex: null } : null,
      fields.exercise !== ""
        ? {
            label: fields.exercise === "0" ? t("exerciseNone") : fields.exercise === "90" ? t("exercise90") : t("exerciseMinutes", { minutes: Number(fields.exercise) }),
            hex: valueHex("exercise_minutes", fields.exercise),
          }
        : null,
      fields.stress !== "" ? { label: t("stressChip", { level: Number(fields.stress) }), hex: valueHex("stress", fields.stress) } : null,
    ].filter((c): c is { label: string; hex: string | null } => c !== null);
    return (
      <section ref={root} className={JOURNAL_CARD} data-testid="checkin-summary">
        {/* The mockups (decision 161): the mood's face and its name, Edit on
            the right. The heading still says what it answers, for screen
            readers ("How are you today? Good"). */}
        <div className="flex items-center justify-between gap-3">
          <h2
            tabIndex={-1}
            aria-labelledby={`${moodTitle}-q ${moodTitle}-a`}
            className="flex items-center gap-3 text-lg font-medium text-text outline-none"
            data-testid="checkin-summary-mood"
          >
            <MoodFace mood={mood} className="h-9 w-9" />
            <span id={`${moodTitle}-q`} className="sr-only">
              {t("checkinTitle")}
            </span>
            <span id={`${moodTitle}-a`}>{t(`mood${mood}` as "mood1")}</span>
          </h2>
          <button type="button" data-testid="checkin-edit" onClick={() => setEditing(true)} className="min-h-11 font-medium text-accent underline underline-offset-4">
            {t("checkinEdit")}
          </button>
        </div>
        {chips.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" data-testid="checkin-summary-chips">
            {chips.map(({ label, hex }) => (
              <li key={label} className="inline-flex items-center gap-2 rounded-full bg-pill px-3 py-1 text-sm text-text">
                <ValueDot hex={hex} />
                {label}
              </li>
            ))}
          </ul>
        )}
        {/* Visual; the announcement is checkin-announce. */}
        <p className="mt-3 text-sm text-muted" data-testid="checkin-status">
          {offline ? t("checkinSavedOfflineWeb") : t("checkinSaved")}
        </p>
      </section>
    );
  }

  return (
    <form ref={(el) => void (root.current = el)} onSubmit={submit} className={JOURNAL_CARD} data-testid="checkin-card">
      {/* One group, named once (a fieldset + a radiogroup were read twice;
          a11y pass): the title labels the radiogroup. */}
      <div>
        <h2 id={moodTitle} className="text-lg font-medium text-text">
          {t("checkinTitle")}
        </h2>
        {/* The faces (mood-faces.json) with all five labels under them, the
            chosen one in the accent (UX, superseding decision 105's hidden
            labels). Every face stays a ≥ 48 px target; at large text or zoom
            a face grows to its label's longest word and the row wraps, so a
            label never breaks mid-word. */}
        <div className="@container mt-4">
          <div className={MOOD_ROW} role="radiogroup" aria-labelledby={moodTitle} aria-required="true" onKeyDown={moveMood}>
            {MOODS.map((mood) => (
              <button
                key={mood}
                type="button"
                role="radio"
                aria-checked={fields.mood === mood}
                // One tab stop for the group (the chosen face, else the first);
                // arrows move between faces, as for native radios.
                tabIndex={fields.mood === mood || (fields.mood === null && mood === MOODS[0]) ? 0 : -1}
                data-testid={`checkin-mood-${mood}`}
                onClick={() => set({ mood })}
                className={`${MOOD_FACE} ${fields.mood === mood ? "bg-pill text-accent" : "text-muted hover:bg-pill"}`}
              >
                <MoodFace mood={mood} className="h-9 w-9" selected={fields.mood === mood} />
                <span className={MOOD_LABEL} data-testid={`checkin-mood-label-${mood}`}>
                  {t(`mood${mood}` as "mood1")}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {fields.mood !== null && (
        <div className="mt-6 space-y-6">
          <fieldset>
            <legend className="text-sm font-medium text-text">
              {t("sleepTitle")} <span className="ml-2 font-normal text-muted">{t("optional")}</span>
            </legend>
            {/* A stepper, as the app (decision 206): − value +, half an hour a
                step, 0 to 14. Empty shows "–"; the first step either way
                starts at 7. There's no way back to empty, the same as the
                app. The value is spoken after each step. */}
            <div className="mt-2 flex items-center gap-1">
              <button
                type="button"
                data-testid="checkin-sleep-hours-minus"
                aria-label={t("sleepLess")}
                title={t("sleepLess")}
                onClick={() => stepSleep(-1)}
                className={STEP_BUTTON}
              >
                <StepIcon plus={false} />
              </button>
              <span data-testid="checkin-sleep-hours" aria-live="polite" className="inline-flex min-w-20 items-center justify-center gap-2 text-text">
                {/* The chosen value's colour (decision 150): only once one is picked. */}
                {fields.sleepHours !== "" && <ValueDot hex={valueHex("sleep_hours", fields.sleepHours)} testId="checkin-sleep-dot" />}
                {fields.sleepHours === "" ? "–" : t("sleepHours", { hours: Number(fields.sleepHours) })}
              </span>
              <button
                type="button"
                data-testid="checkin-sleep-hours-plus"
                aria-label={t("sleepMore")}
                title={t("sleepMore")}
                onClick={() => stepSleep(1)}
                className={STEP_BUTTON}
              >
                <StepIcon plus />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
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
              {t("exerciseTitle")} <span className="ml-2 font-normal text-muted">{t("optional")}</span>
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
                  {fields.exercise === String(m) && <ValueDot hex={valueHex("exercise_minutes", m)} testId="checkin-exercise-dot" />}
                  {m === 0 ? t("exerciseNone") : m === 90 ? t("exercise90") : t("exerciseMinutes", { minutes: m })}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-text">
              {t("stressTitle")} <span className="ml-2 font-normal text-muted">{t("optional")}</span>
            </legend>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              {STRESS_LEVELS.map((s) => (
                <div key={s} className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={fields.stress === String(s)}
                    // "Stress 1 of 5", not just "1" (the Low/High captions aren't
                    // part of the button; a11y pass).
                    aria-label={t("stressLevelLabel", { n: s })}
                    data-testid={`checkin-stress-${s}`}
                    onClick={() => set({ stress: fields.stress === String(s) ? "" : String(s) })}
                    className={`${chip(fields.stress === String(s))} min-w-12 px-0`}
                  >
                    {fields.stress === String(s) && <ValueDot hex={valueHex("stress", s)} testId="checkin-stress-dot" />}
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
        className={`mt-6 ${PRIMARY_SAVE}`}
      >
        {t("checkinSave")}
      </button>
    </form>
  );
}
