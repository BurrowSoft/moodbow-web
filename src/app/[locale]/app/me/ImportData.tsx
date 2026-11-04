"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { GetHelpNow } from "@/components/SafetyCard";
import { decodeImportFile, displayOrder, IMPORT_BATCH, MAX_IMPORT_BYTES, planImport, type DateOrder, type ImportEntry, type ImportPlan, type Mood } from "@/lib/import/journalImport";
import { dropExistingNotes } from "@/lib/import/noteDedupe";
import { importEntryId } from "@/lib/import/uuidv5";
import { IMPORT_BATCH_WAIT_MS, withTimeout } from "@/lib/ui/withTimeout";
import { flagsCrisis } from "@/lib/safety/crisis";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { existingNoteCounts, importCheckIns, importEntries } from "./importActions";

// Import from another journal (1.1 K, decision 189), in Me → Your data:
// choose a file → it's read in this browser only → a preview (counts, what
// isn't imported, the date reading or mood levels when the file can't tell)
// → Import writes the confirmed plan in batches, never overwriting → a
// summary. The file itself (and its name) is never sent or kept; only the
// rows the person imports are saved. Imported notes run past the crisis
// matcher without a safety card each; one quiet line at the end if any of
// the notes actually written did.

// keptExisting: a day counted as imported (something of it was written)
// kept the check-in it already had: the file's wasn't written (never
// overwritten). A day with nothing new is just "skipped" (decision 214).
type Summary = { days: number; skippedDays: number; crisis: boolean; keptExisting: boolean };
type Phase =
  | { kind: "idle" }
  | { kind: "error" }
  | { kind: "preview"; plan: ImportPlan }
  | { kind: "importing"; done: number; total: number }
  | ({ kind: "done" } & Summary)
  // Stopped part-way: what's written stays (a re-import skips it).
  | ({ kind: "failed"; offline: boolean } & Summary);

// A custom mood's choice: a level, or "skip" (Don't import). Until every
// name has one, Import stays disabled (settled, reviewer #92 B4).
type MoodChoice = Mood | "skip";
const MOODS: Mood[] = [5, 4, 3, 2, 1];
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const levelsOnly = (choices: Record<string, MoodChoice>) =>
  Object.fromEntries(Object.entries(choices).filter((e): e is [string, Mood] => e[1] !== "skip"));

export function ImportData({ uid, today, dateLocaleTag, country }: { uid: string; today: string; dateLocaleTag: string; country?: string | null }) {
  const t = useTranslations("me");
  const tt = useTranslations("today");
  const ta = useTranslations("ai");
  const inputId = useId();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // The file's text, in memory only while the preview is open.
  const text = useRef<string | null>(null);
  const [dateOrder, setDateOrder] = useState<DateOrder>("dmy");
  const [moodChoices, setMoodChoices] = useState<Record<string, MoodChoice>>({});
  const input = useRef<HTMLInputElement>(null);
  // Set the moment Import is pressed, before any await (reviewer #92 B1).
  const running = useRef(false);

  // Leaving mid-import asks first; what's written so far stays either way.
  const importing = phase.kind === "importing";
  useEffect(() => {
    if (!importing) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [importing]);

  const replan = (order: DateOrder, choices: Record<string, MoodChoice>) => {
    if (text.current === null) return;
    const result = planImport(text.current, today, { dateOrder: order, customMoods: levelsOnly(choices) });
    setPhase(result.status === "ok" ? { kind: "preview", plan: result.plan } : { kind: "error" });
  };

  const choose = async (file: File | undefined) => {
    if (!file || running.current) return;
    text.current = null;
    // Too big is refused before a byte is read (reviewer #92 B2).
    if (file.size > MAX_IMPORT_BYTES) {
      setPhase({ kind: "error" });
      return;
    }
    const decoded = decodeImportFile(await file.arrayBuffer());
    if (decoded.status !== "ok") {
      setPhase({ kind: "error" });
      return;
    }
    text.current = decoded.text;
    setDateOrder("dmy");
    setMoodChoices({});
    replan("dmy", {});
  };

  const reset = () => {
    text.current = null;
    setPhase({ kind: "idle" });
    if (input.current) input.current.value = "";
  };

  const run = async (plan: ImportPlan) => {
    if (running.current) return;
    running.current = true;
    setPhase({ kind: "importing", done: 0, total: plan.days.length + plan.entries.length });
    // The notes the account already has (per day and exact text), counted
    // once before anything is written: those copies are skipped, so
    // importing your own export again adds nothing (1.1 P "M1").
    let kept: ImportEntry[];
    let dropped: ImportEntry[];
    try {
      // Each call gets 60 s; past it the import stops ("failed"), safe to run
      // again: the same file gives the same ids (the timeout audit).
      const counts = await withTimeout(existingNoteCounts([...new Set(plan.entries.map((e) => e.date))]), IMPORT_BATCH_WAIT_MS);
      if (counts.status !== "ok") throw new Error("counts");
      ({ keep: kept, dropped } = await dropExistingNotes(plan.entries, new Map(counts.counts)));
    } catch (e) {
      if (typeof (e as { digest?: unknown })?.digest === "string") throw e; // a redirect (signed out)
      text.current = null;
      running.current = false;
      setPhase({ kind: "failed", offline: !navigator.onLine, days: 0, skippedDays: 0, crisis: false, keptExisting: false });
      return;
    }
    const total = plan.days.length + kept.length;
    setPhase({ kind: "importing", done: 0, total });
    const entries = await Promise.all(kept.map(async (e) => ({ id: await importEntryId(uid, e), date: e.date, body: e.body, ...(e.isMoment ? { isMoment: true } : {}) })));
    const byId = new Map(entries.map((e) => [e.id, e]));
    // What was actually written: its days, and its notes (for the crisis line).
    const writtenDates = new Set<string>();
    const writtenBodies: string[] = [];
    // Per day: how many items (its check-in, its notes) the plan has, and how
    // many were sent in a batch that ran. A day is "already in Moodbow" only
    // when all of it was tried and nothing was new; after a part-way stop,
    // days not reached yet aren't counted (reviewer #92).
    const items = new Map<string, number>();
    const tried = new Map<string, number>();
    for (const d of [...plan.days.map((x) => x.date), ...plan.entries.map((x) => x.date)]) items.set(d, (items.get(d) ?? 0) + 1);
    const markTried = (dates: string[]) => dates.forEach((d) => tried.set(d, (tried.get(d) ?? 0) + 1));
    // Copies already in the account: tried, and not new.
    markTried(dropped.map((e) => e.date));
    // Days whose check-in the account already had (the server wrote nothing).
    const keptDates = new Set<string>();
    let done = 0;
    const summary = (): Summary => ({
      days: writtenDates.size,
      skippedDays: [...items].filter(([d, n]) => tried.get(d) === n && !writtenDates.has(d)).length,
      crisis: writtenBodies.some((b) => flagsCrisis(b, CRISIS_KEYWORDS)),
      keptExisting: [...keptDates].some((d) => writtenDates.has(d)),
    });
    try {
      for (const batch of chunks(plan.days, IMPORT_BATCH)) {
        const r = await withTimeout(importCheckIns(batch), IMPORT_BATCH_WAIT_MS);
        if (r.status !== "ok") throw new Error("batch");
        r.written.forEach((d) => writtenDates.add(d));
        for (const d of batch) if (!r.written.includes(d.date)) keptDates.add(d.date);
        markTried(batch.map((d) => d.date));
        done += batch.length;
        setPhase({ kind: "importing", done, total });
      }
      for (const batch of chunks(entries, IMPORT_BATCH)) {
        const r = await withTimeout(importEntries(batch), IMPORT_BATCH_WAIT_MS);
        if (r.status !== "ok") throw new Error("batch");
        for (const id of r.written) {
          const e = byId.get(id);
          if (!e) continue;
          writtenDates.add(e.date);
          writtenBodies.push(e.body);
        }
        markTried(batch.map((e) => e.date));
        done += batch.length;
        setPhase({ kind: "importing", done, total });
      }
    } catch (e) {
      if (typeof (e as { digest?: unknown })?.digest === "string") throw e; // a redirect (signed out)
      text.current = null;
      running.current = false;
      setPhase({ kind: "failed", offline: !navigator.onLine, ...summary() });
      return;
    }
    text.current = null;
    running.current = false;
    setPhase({ kind: "done", ...summary() });
  };

  const fmt = (d: string) => new Intl.DateTimeFormat(dateLocaleTag, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const allMapped = (plan: ImportPlan) => plan.customMoods.every((name) => moodChoices[name] !== undefined);
  const finished = phase.kind === "done" || phase.kind === "failed";

  return (
    <section aria-labelledby="import-title" data-testid="import" className="mt-6">
      <h3 id="import-title" className="font-medium text-text">
        {t("importTitle")}
      </h3>
      <p className="mt-1 text-sm text-muted">{t("importBody")}</p>
      <div className="mt-3">
        <label htmlFor={inputId} className={`${dialogButton()} cursor-pointer`}>
          {t("importChooseFile")}
        </label>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          data-testid="import-file"
          disabled={importing}
          className="sr-only"
          onChange={(e) => void choose(e.target.files?.[0])}
        />
      </div>

      {phase.kind === "error" && (
        <p role="alert" data-testid="import-error" className="mt-3 text-sm font-medium text-accent">
          {t("importError")}
        </p>
      )}

      <div role="status" className="mt-3 space-y-2 text-sm text-text" data-testid="import-status">
        {phase.kind === "preview" && (
          <Preview
            plan={phase.plan}
            fmt={fmt}
            t={t}
            tt={tt}
            dateOrder={dateOrder}
            onDateOrder={(o) => {
              setDateOrder(o);
              replan(o, moodChoices);
            }}
            moodChoices={moodChoices}
            onMood={(name, choice) => {
              const choices = { ...moodChoices, [name]: choice };
              setMoodChoices(choices);
              replan(dateOrder, choices);
            }}
          />
        )}
        {importing && <p data-testid="import-progress">{t("importProgress", { done: phase.done, total: phase.total })}</p>}
        {/* Done, and nothing was new (your own export again): one line, not
            "0 days are in your Timeline" plus the skipped count (UX, 1.1 §K). */}
        {phase.kind === "done" && phase.days === 0 && phase.skippedDays > 0 ? (
          <p data-testid="import-nothing-new">{t("importNothingNew")}</p>
        ) : finished && (
          <>
            {phase.kind === "done" && <p data-testid="import-done">{t("importDone", { days: phase.days })}</p>}
            {phase.skippedDays > 0 && <p data-testid="import-skipped">{t("importSkipped", { count: phase.skippedDays })}</p>}
            {/* A day whose check-in was kept still counts in "days are in your
                Timeline" when a note of it was written: say why its mood is
                the one already there (Web Tester's C4, UX). */}
            {phase.keptExisting && <p data-testid="import-kept-existing">{t("importKeptExisting")}</p>}
          </>
        )}
        {/* Stopped part-way (a lost connection, a server error): the file
            was fine and what's done is saved, so the fix is the same file
            again (Web Tester I13; UX). Offline says so first. */}
        {phase.kind === "failed" && (
          <div role="alert" data-testid="import-failed" className="font-medium text-accent">
            {phase.offline && <p data-testid="import-offline">{ta("errOffline")}</p>}
            <p>{t("importStopped")}</p>
          </div>
        )}
      </div>

      {phase.kind === "preview" && (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="import-confirm"
            disabled={!allMapped(phase.plan)}
            className={`${dialogButton(true)} disabled:opacity-50`}
            onClick={() => void run(phase.plan)}
          >
            {t("importConfirm")}
          </button>
          <button type="button" data-testid="import-cancel" className={dialogButton()} onClick={reset}>
            {t("cancel")}
          </button>
        </div>
      )}

      {/* One quiet line at the end, never a card per note (decision 189):
          over the notes actually written, also after a part-way stop (B5). */}
      {finished && phase.crisis && (
        <div data-testid="import-crisis" className="mt-4">
          <p className="text-sm text-muted">{t("importCrisisLine")}</p>
          <div className="mt-2">
            <GetHelpNow country={country} testId="import-get-help" />
          </div>
        </div>
      )}
    </section>
  );
}

type T = ReturnType<typeof useTranslations<"me">>;
type TT = ReturnType<typeof useTranslations<"today">>;

function Preview({
  plan,
  fmt,
  t,
  tt,
  dateOrder,
  onDateOrder,
  moodChoices,
  onMood,
}: {
  plan: ImportPlan;
  fmt: (d: string) => string;
  t: T;
  tt: TT;
  dateOrder: DateOrder;
  onDateOrder: (o: DateOrder) => void;
  moodChoices: Record<string, MoodChoice>;
  onMood: (name: string, choice: MoodChoice) => void;
}) {
  // The UI language (en / th), for the order of names shown (displayOrder).
  const locale = useLocale();
  const dayCount = new Set([...plan.days.map((d) => d.date), ...plan.entries.map((e) => e.date)]).size;
  const capped = plan.skipped.olderDays + plan.skipped.olderEntries;
  return (
    <div data-testid="import-preview" className="space-y-2">
      {plan.range ? (
        <p data-testid="import-summary">{t("importPreview", { days: dayCount, notes: plan.entries.length, first: fmt(plan.range.first), last: fmt(plan.range.last) })}</p>
      ) : null}
      {plan.notImported.activities.length > 0 && <p className="text-muted">{t("importNotImported")}</p>}
      {plan.skipped.future > 0 && <p className="text-muted">{t("importSkippedFuture", { count: plan.skipped.future })}</p>}
      {capped > 0 && <p className="text-muted">{t("importSkippedCap", { count: capped })}</p>}
      {plan.skipped.tooLong > 0 && <p className="text-muted">{t("importSkippedTooLong", { count: plan.skipped.tooLong })}</p>}

      {plan.dateFormat === "ambiguous" && (
        <fieldset className="mt-2" data-testid="import-date-format">
          <legend className="font-medium">{t("importDateFormat")}</legend>
          {(["dmy", "mdy"] as const).map((o) => (
            <label key={o} className="mt-1 flex min-h-11 items-center gap-2">
              <input type="radio" name="import-date-format" value={o} checked={dateOrder === o} onChange={() => onDateOrder(o)} data-testid={`import-date-${o}`} />
              {t(o === "dmy" ? "importDateDMY" : "importDateMDY")}
            </label>
          ))}
        </fieldset>
      )}

      {plan.customMoods.length > 0 && (
        <fieldset className="mt-2" data-testid="import-moods">
          <legend className="font-medium">{t("importMapMoods")}</legend>
          {/* In the UI language's order (displayOrder); each choice is still
              keyed by the name itself. */}
          {displayOrder(plan.customMoods, locale).map((name, i) => (
            <label key={name} className="mt-1 flex min-h-11 flex-wrap items-center gap-2">
              <span>{name}</span>
              <select
                data-testid={`import-mood-${i}`}
                value={moodChoices[name] === undefined ? "" : String(moodChoices[name])}
                onChange={(e) => onMood(name, e.target.value === "skip" ? "skip" : (Number(e.target.value) as Mood))}
                className="min-h-11 rounded-full border border-border bg-bg px-3 text-text"
              >
                <option value="" disabled>
                  {t("importMapChoose")}
                </option>
                {MOODS.map((m) => (
                  <option key={m} value={m}>
                    {tt(`mood${m}` as "mood1")}
                  </option>
                ))}
                <option value="skip">{t("importMapSkip")}</option>
              </select>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
