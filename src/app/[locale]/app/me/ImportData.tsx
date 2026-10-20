"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { GetHelpNow } from "@/components/SafetyCard";
import { decodeImportFile, IMPORT_BATCH, planImport, type DateOrder, type ImportPlan, type Mood } from "@/lib/import/journalImport";
import { importEntryId } from "@/lib/import/uuidv5";
import { flagsCrisis } from "@/lib/safety/crisis";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { importCheckIns, importEntries } from "./importActions";

// Import from another journal (1.1 K, decision 189), in Me → Your data:
// choose a file → it's read in this browser only → a preview (counts, what
// isn't imported, the date reading or mood levels when the file can't tell)
// → Import writes the confirmed plan in batches, never overwriting → a
// summary. The file itself (and its name) is never sent or kept; only the
// rows the person imports are saved. Imported notes run past the crisis
// matcher without a safety card each; one quiet line at the end if any did.

type Phase =
  | { kind: "idle" }
  | { kind: "error" }
  | { kind: "preview"; plan: ImportPlan }
  | { kind: "importing"; done: number; total: number }
  | { kind: "done"; days: number; skippedDays: number; crisis: boolean }
  | { kind: "failed"; days: number };

const MOODS: Mood[] = [5, 4, 3, 2, 1];
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export function ImportData({ uid, today, dateLocaleTag, country }: { uid: string; today: string; dateLocaleTag: string; country?: string | null }) {
  const t = useTranslations("me");
  const tt = useTranslations("today");
  const inputId = useId();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // The file's text, in memory only while the preview is open.
  const text = useRef<string | null>(null);
  const [dateOrder, setDateOrder] = useState<DateOrder>("dmy");
  const [moodMap, setMoodMap] = useState<Record<string, Mood>>({});
  const input = useRef<HTMLInputElement>(null);

  const replan = (order: DateOrder, map: Record<string, Mood>) => {
    if (text.current === null) return;
    const result = planImport(text.current, today, { dateOrder: order, customMoods: map });
    setPhase(result.status === "ok" ? { kind: "preview", plan: result.plan } : { kind: "error" });
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    const decoded = decodeImportFile(await file.arrayBuffer());
    if (decoded.status !== "ok") {
      text.current = null;
      setPhase({ kind: "error" });
      return;
    }
    text.current = decoded.text;
    setDateOrder("dmy");
    setMoodMap({});
    replan("dmy", {});
  };

  const reset = () => {
    text.current = null;
    setPhase({ kind: "idle" });
    if (input.current) input.current.value = "";
  };

  const run = async (plan: ImportPlan) => {
    const entries = await Promise.all(plan.entries.map(async (e) => ({ id: await importEntryId(uid, e), date: e.date, body: e.body })));
    const total = plan.days.length + entries.length;
    let done = 0;
    let written = 0;
    let skippedDays = 0;
    setPhase({ kind: "importing", done, total });
    try {
      for (const batch of chunks(plan.days, IMPORT_BATCH)) {
        const r = await importCheckIns(batch);
        if (r.status !== "ok") throw new Error("batch");
        written += r.written;
        skippedDays += r.skipped;
        done += batch.length;
        setPhase({ kind: "importing", done, total });
      }
      for (const batch of chunks(entries, IMPORT_BATCH)) {
        const r = await importEntries(batch);
        if (r.status !== "ok") throw new Error("batch");
        done += batch.length;
        setPhase({ kind: "importing", done, total });
      }
    } catch (e) {
      if (typeof (e as { digest?: unknown })?.digest === "string") throw e; // a redirect (signed out)
      // What's written stays; importing the same file again skips it.
      text.current = null;
      setPhase({ kind: "failed", days: written });
      return;
    }
    text.current = null;
    setPhase({ kind: "done", days: written, skippedDays, crisis: plan.entries.some((e) => flagsCrisis(e.body, CRISIS_KEYWORDS)) });
  };

  const fmt = (d: string) => new Intl.DateTimeFormat(dateLocaleTag, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const busy = phase.kind === "importing";

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
          disabled={busy}
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
              replan(o, moodMap);
            }}
            moodMap={moodMap}
            onMood={(name, level) => {
              const map = { ...moodMap };
              if (level === null) delete map[name];
              else map[name] = level;
              setMoodMap(map);
              replan(dateOrder, map);
            }}
          />
        )}
        {phase.kind === "importing" && <p data-testid="import-progress">{t("importProgress", { done: phase.done, total: phase.total })}</p>}
        {phase.kind === "done" && (
          <>
            <p data-testid="import-done">{t("importDone", { days: phase.days })}</p>
            {phase.skippedDays > 0 && <p data-testid="import-skipped">{t("importSkipped", { count: phase.skippedDays })}</p>}
          </>
        )}
        {phase.kind === "failed" && (
          <p role="alert" data-testid="import-failed" className="font-medium text-accent">
            {t("importError")}
          </p>
        )}
      </div>

      {phase.kind === "preview" && (
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" data-testid="import-confirm" className={dialogButton(true)} onClick={() => void run(phase.plan)}>
            {t("importConfirm")}
          </button>
          <button type="button" data-testid="import-cancel" className={dialogButton()} onClick={reset}>
            {t("cancel")}
          </button>
        </div>
      )}

      {/* One quiet line at the end, never a card per note (decision 189). */}
      {phase.kind === "done" && phase.crisis && (
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
  moodMap,
  onMood,
}: {
  plan: ImportPlan;
  fmt: (d: string) => string;
  t: T;
  tt: TT;
  dateOrder: DateOrder;
  onDateOrder: (o: DateOrder) => void;
  moodMap: Record<string, Mood>;
  onMood: (name: string, level: Mood | null) => void;
}) {
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
          {plan.customMoods.map((name, i) => (
            <label key={name} className="mt-1 flex min-h-11 flex-wrap items-center gap-2">
              <span>{name}</span>
              <select
                data-testid={`import-mood-${i}`}
                value={moodMap[name] ?? ""}
                onChange={(e) => onMood(name, e.target.value === "" ? null : (Number(e.target.value) as Mood))}
                className="min-h-11 rounded-full border border-border bg-bg px-3 text-text"
              >
                <option value="">{t("importMapSkip")}</option>
                {MOODS.map((m) => (
                  <option key={m} value={m}>
                    {tt(`mood${m}` as "mood1")}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
