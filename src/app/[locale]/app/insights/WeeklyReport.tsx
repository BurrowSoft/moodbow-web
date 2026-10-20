"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { GetHelpNow } from "@/components/SafetyCard";
import { IN_PROGRESS_LIMIT_MS, IN_PROGRESS_RETRY_MS, REFLECT_CLIENT_DEADLINE_MS } from "@/lib/journal/reflect";
import { isCrisis, type ReportErrorKey, type ReportResult, type WeeklyReport as Report } from "@/lib/journal/report";
import { deleteWeeklyReport, requestWeeklyReport } from "./reportActions";

type Phase = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: ReportErrorKey } | { kind: "offline" };

const withDeadline = (call: Promise<ReportResult>, ms: number): Promise<ReportResult> =>
  new Promise((done, fail) => {
    const timer = window.setTimeout(() => done({ status: "no_answer" }), ms);
    call.then(
      (r) => {
        window.clearTimeout(timer);
        done(r);
      },
      (e) => {
        window.clearTimeout(timer);
        fail(e);
      },
    );
  });
const wait = (ms: number) => new Promise((done) => window.setTimeout(done, ms));
const isRedirect = (e: unknown) => typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT");

// Monday–Sunday as one range in the region's format ("12–18 Oct"), no copy key (decision 180).
export function weekRange(weekStart: string, dateLocaleTag: string): string {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return new Intl.DateTimeFormat(dateLocaleTag, { day: "numeric", month: "short", timeZone: "UTC" }).formatRange(start, end);
}

const SECTIONS = [
  ["changed", "reportChanged"],
  ["went_well", "reportWentWell"],
  ["notice", "reportNotice"],
  ["idea", "reportIdea"],
] as const;

// "Your week" on Insights (1.1 D, layout A, decision 180): the last complete
// week's report, on demand (never pushed). One per week: asking again shows
// the stored one; Delete report allows a new one. Each tap has its own
// client_key, resent unchanged on every retry of that tap. The report is
// plain text in Moodbow's voice card (decision 150), four headed sections,
// or, for a crisis week, only its text and the Get help button (decisions
// 124, 157). Shown only where canReflect(me) (the page decides).
type Props = { initial: Report | null; weekStart: string; dateLocaleTag: string; balance: number; country?: string | null };
export function WeeklyReport({ initial, weekStart, dateLocaleTag, balance, country }: Props) {
  const t = useTranslations("ai");
  const ta = useTranslations("app");
  const tt = useTranslations("today");
  const [report, setReport] = useState(initial);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [hidden, setHidden] = useState(false);
  const [creditsOut, setCreditsOut] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [said, setSaid] = useState<"reportReady" | "reportDeleted" | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const resultBox = useRef<HTMLDivElement>(null);
  const focusResult = useRef(false);
  const focusButton = useRef(false);
  const lastBalance = useRef(balance);
  const tapKey = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const run = async (key: string) => {
    tapKey.current = key;
    setSaid(null);
    setPhase({ kind: "loading" });
    const started = Date.now();
    for (;;) {
      let result;
      try {
        result = await withDeadline(requestWeeklyReport(key), REFLECT_CLIENT_DEADLINE_MS);
      } catch (e) {
        if (isRedirect(e)) throw e;
        if (alive.current) setPhase({ kind: "offline" });
        return;
      }
      if (!alive.current) return;
      if (result.status === "no_answer") {
        setPhase({ kind: "offline" });
        return;
      }
      if (result.status === "in_progress") {
        if (Date.now() - started + IN_PROGRESS_RETRY_MS > IN_PROGRESS_LIMIT_MS) {
          setPhase({ kind: "offline" });
          return;
        }
        await wait(IN_PROGRESS_RETRY_MS);
        if (!alive.current) return;
        continue;
      }
      tapKey.current = null;
      if (result.status === "hidden") {
        setHidden(true);
        return;
      }
      if (result.status === "error") {
        setPhase({ kind: "error", message: result.message });
        return;
      }
      focusResult.current = document.activeElement === button.current;
      setReport(result.report);
      setSaid("reportReady");
      if (result.balance !== null) {
        setCreditsOut(lastBalance.current > 0 && result.balance <= 0);
        lastBalance.current = result.balance;
      }
      setPhase({ kind: "idle" });
      return;
    }
  };

  const loading = phase.kind === "loading";
  const tap = () => {
    if (loading || deleting) return;
    void run(crypto.randomUUID());
  };
  const retrySameTap = () => {
    if (loading || !tapKey.current) return;
    void run(tapKey.current);
  };

  const closeConfirm = useCallback(() => setConfirming(false), []);
  const remove = async () => {
    if (!report || deleting) return;
    setConfirming(false);
    setSaid(null);
    setDeleting(true);
    setDeleteFailed(false);
    let ok = false;
    try {
      ok = (await deleteWeeklyReport(report.id)).ok;
    } catch (e) {
      if (isRedirect(e)) throw e;
    }
    if (!alive.current) return;
    setDeleting(false);
    if (ok) {
      setReport(null);
      setCreditsOut(false);
      setPhase({ kind: "idle" });
      setSaid("reportDeleted");
      focusButton.current = true;
    } else setDeleteFailed(true);
  };
  useEffect(() => {
    if (report && focusResult.current) {
      focusResult.current = false;
      resultBox.current?.focus();
    } else if (!report && focusButton.current) {
      focusButton.current = false;
      button.current?.focus();
    }
  }, [report]);

  if (hidden) return null;
  // Too few check-ins that week (422 not_enough): the note replaces the button.
  const notEnough = phase.kind === "error" && phase.message === "reportNotEnough";

  return (
    <section aria-labelledby="week-title" data-testid="weekly-report" className="mt-8 rounded-3xl border border-border bg-surface p-5">
      <h2 id="week-title" className="text-lg font-medium text-text">
        {t("reportWeekly")}
      </h2>
      <p data-testid="weekly-report-range" className="text-sm text-muted">
        {weekRange(report?.week_start ?? weekStart, dateLocaleTag)}
      </p>

      {report && (
        <div ref={resultBox} tabIndex={-1} data-testid="weekly-report-result" className="mt-4 rounded-2xl border-l-4 border-voice bg-voice-surface p-4 focus:outline-none">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-voice">
            <span>{ta("appName")}</span>
            {report.tier === "lite" && (
              <span data-testid="weekly-report-lite" className="inline-block rounded-full border border-voice px-3 py-0.5 text-xs font-medium text-voice">
                {t("reflectLiteBadge")}
              </span>
            )}
          </p>
          {isCrisis(report.body) ? (
            <>
              <p data-testid="weekly-report-crisis" className="whitespace-pre-line text-text">
                {report.body.crisis}
              </p>
              <div className="mt-4">
                <GetHelpNow country={country} testId="weekly-report-get-help" />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {SECTIONS.map(([field, heading]) => {
                const text = (report.body as { sections: Record<string, string | undefined> }).sections[field];
                return text ? (
                  <div key={field} data-testid={`weekly-report-${field}`}>
                    <h3 className="font-medium text-text">{t(heading)}</h3>
                    <p className="mt-1 whitespace-pre-line text-text">{text}</p>
                  </div>
                ) : null;
              })}
            </div>
          )}
          {creditsOut && (
            <p data-testid="weekly-report-credits-out" className="mt-3 text-sm text-muted">
              {t("creditsOut")}
            </p>
          )}
          <button
            type="button"
            data-testid="weekly-report-delete"
            aria-disabled={loading || deleting}
            onClick={() => !loading && !deleting && setConfirming(true)}
            className="mt-4 font-medium text-accent underline underline-offset-4 aria-disabled:opacity-50"
          >
            {t("reportDelete")}
          </button>
          {deleteFailed && (
            <p role="alert" data-testid="weekly-report-delete-error" className="mt-2 text-sm font-medium text-accent">
              {tt("errGeneric")}
            </p>
          )}
        </div>
      )}

      {!report && loading && (
        <div aria-hidden="true" data-testid="weekly-report-loading" className="mt-4 rounded-2xl border-l-4 border-voice bg-voice-surface p-4">
          <p className="text-sm font-medium text-voice">{ta("appName")}</p>
          <p className="mt-1 text-muted">{t("reportLoading")}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-pill">
            <div className="h-full w-1/3 animate-[nav-progress_1.4s_ease-in-out_infinite] rounded-full bg-voice motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-40" />
          </div>
        </div>
      )}

      <div className="mt-4">
        {!report && !notEnough && (
          <button
            type="button"
            ref={button}
            data-testid="weekly-report-button"
            onClick={tap}
            aria-disabled={loading || deleting}
            className={`${dialogButton(true)} aria-disabled:opacity-50`}
          >
            {t("reportButton")}
          </button>
        )}
        <p role="status" data-testid="weekly-report-status" className="mt-3 text-sm text-muted">
          {loading ? <span className="sr-only">{t("reportLoading")}</span> : said ? t(said) : null}
        </p>
        {notEnough && (
          <p data-testid="weekly-report-not-enough" className="text-muted">
            {t("reportNotEnough")}
          </p>
        )}
        {phase.kind === "error" && !notEnough && (
          <p role="alert" data-testid="weekly-report-error" className="text-sm font-medium text-accent">
            {t(phase.message)}
          </p>
        )}
        {phase.kind === "offline" && (
          <div>
            <p role="alert" data-testid="weekly-report-error" className="text-sm font-medium text-accent">
              {t("errOffline")}
            </p>
            <button type="button" data-testid="weekly-report-retry" onClick={retrySameTap} className="mt-2 min-h-11 rounded-full border border-border px-4 text-sm font-medium text-text">
              {ta("tryAgain")}
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <Dialog title={t("reportDeleteConfirmTitle")} body={t("reportDeleteConfirmBody")} onCancel={closeConfirm} testId="weekly-report-delete-dialog">
          <button type="button" data-testid="weekly-report-delete-cancel" className={dialogButton()} onClick={closeConfirm}>
            {t("cancel")}
          </button>
          <button type="button" data-testid="weekly-report-delete-confirm" className={dialogButton(true)} onClick={() => void remove()}>
            {t("reportDelete")}
          </button>
        </Dialog>
      )}
    </section>
  );
}
