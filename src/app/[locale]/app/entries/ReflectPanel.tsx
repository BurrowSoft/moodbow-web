"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { GetHelpNow } from "@/components/SafetyCard";
import { lastQuestion } from "@/lib/journal/answer";
import getHelpLabel from "../../../../../content/contracts/get-help-label.json";
import { IN_PROGRESS_LIMIT_MS, IN_PROGRESS_RETRY_MS, REFLECT_CLIENT_DEADLINE_MS, type Reflection, type ReflectErrorKey, type ReflectResult } from "@/lib/journal/reflect";
import { deleteReflection, reflectOnEntry } from "./reflectActions";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  // A final answer: the next tap is a new one (a new client_key).
  | { kind: "error"; message: ReflectErrorKey }
  // No answer reached the browser: Try again resends the same tap.
  | { kind: "offline" };

// The reply names the button in the entry's language, which may not be the
// UI's: any label in the shared contract counts (reviewer #35).
const GET_HELP_LABELS = Object.values(getHelpLabel.labels);
const namesGetHelp = (body: string) => GET_HELP_LABELS.some((label) => body.includes(label));

// One call, or no answer after ms (a hung request): the late answer, if
// any, is ignored; the same key is resent on Try again.
const withDeadline = (call: Promise<ReflectResult>, ms: number): Promise<ReflectResult> =>
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

// "Reflect with Moodbow" under a saved entry (M9, specs/m9-ai-reflections.md;
// reflect.md). Shown only when canReflect(me). One reflection per entry;
// reflecting again replaces it. Each tap has its own client_key, resent
// unchanged on every retry of that tap; the button is disabled while a tap
// is in flight. The body is shown as plain text with its line breaks
// (decision 120), never as HTML. One-shot: no Reflect while a reflection
// exists (UX); Delete reflection stays, and brings Reflect back. onAnswer: "Write your answer" under the
// reflection, with its closing question (the entry view, decision 151).
type Props = { entryId: string; initial: Reflection | null; balance: number; country?: string | null; onAnswer?: (question: string) => void };
export function ReflectPanel({ entryId, initial, balance, country, onAnswer }: Props) {
  const t = useTranslations("ai");
  const ta = useTranslations("app");
  const tt = useTranslations("today");
  const [reflection, setReflection] = useState(initial);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [hidden, setHidden] = useState(false);
  // The one-time "credits ran out" notice: this reply took the last ones.
  const [creditsOut, setCreditsOut] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // What the status line says after "Reading your entry…": the reply is
  // there, or it was deleted (they arrived silently before; a11y pass).
  const [said, setSaid] = useState<"reflectReady" | "reflectDeleted" | null>(null);
  const reflectButton = useRef<HTMLButtonElement>(null);
  const lastBalance = useRef(balance);
  // The current tap's key, kept for a retry after no answer.
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
        result = await withDeadline(reflectOnEntry(entryId, key), REFLECT_CLIENT_DEADLINE_MS);
      } catch (e) {
        if (isRedirect(e)) throw e;
        if (alive.current) setPhase({ kind: "offline" });
        return;
      }
      if (!alive.current) return;
      // No answer: keep the key; Try again resends this same tap.
      if (result.status === "no_answer") {
        setPhase({ kind: "offline" });
        return;
      }
      if (result.status === "in_progress") {
        // Still running after ~30 s: stop asking for now, but it's the same
        // tap (it may finish): Try again resends this key (reviewer #34).
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
      // Reflect goes away with a reflection (one-shot): if it had focus, the
      // reflection takes it (reviewer #51); elsewhere, focus stays put.
      focusResult.current = document.activeElement === reflectButton.current;
      setReflection(result.reflection);
      setSaid("reflectReady");
      if (result.balance !== null) {
        setCreditsOut(lastBalance.current > 0 && result.balance <= 0);
        lastBalance.current = result.balance;
      }
      setPhase({ kind: "idle" });
      return;
    }
  };

  const tap = () => {
    if (phase.kind === "loading" || deleting) return;
    void run(crypto.randomUUID());
  };
  const retrySameTap = () => {
    if (phase.kind === "loading" || !tapKey.current) return;
    void run(tapKey.current);
  };

  const closeConfirm = useCallback(() => setConfirming(false), []);
  const remove = async () => {
    if (!reflection || deleting) return;
    setConfirming(false);
    setSaid(null);
    setDeleting(true);
    setDeleteFailed(false);
    let ok = false;
    try {
      ok = (await deleteReflection(reflection.id)).ok;
    } catch (e) {
      if (isRedirect(e)) throw e;
    }
    if (!alive.current) return;
    setDeleting(false);
    if (ok) {
      setReflection(null);
      setCreditsOut(false);
      setSaid("reflectDeleted");
      // Delete reflection is gone with it: focus Reflect instead, once it's
      // back (it only shows without a reflection; the effect below).
      focusReflect.current = true;
    } else setDeleteFailed(true);
  };
  const focusReflect = useRef(false);
  const focusResult = useRef(false);
  const resultBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reflection && focusResult.current) {
      focusResult.current = false;
      resultBox.current?.focus();
    } else if (!reflection && focusReflect.current) {
      focusReflect.current = false;
      reflectButton.current?.focus();
    }
  }, [reflection]);

  if (hidden) return null;
  const loading = phase.kind === "loading";

  return (
    <section aria-labelledby="reflect-title" className="mt-8 rounded-3xl border border-border bg-surface p-6" data-testid="reflect-panel">
      <h2 id="reflect-title" className="sr-only">
        {t("reflectButton")}
      </h2>
      {reflection && (
        // Moodbow's voice (decision 150): its own colour and surface, never a
        // mood colour and never the entry's mood. Focusable (-1): it takes
        // focus from Reflect, which goes with it (one-shot, reviewer #51).
        <div ref={resultBox} tabIndex={-1} data-testid="reflect-result" className="rounded-2xl border-l-4 border-voice bg-voice-surface p-4 focus:outline-none">
          {/* Who's speaking (the mockups, decision 161), in the voice colour. */}
          <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-voice" data-testid="reflect-voice">
            <span>{ta("appName")}</span>
            {reflection.tier === "lite" && (
              <span data-testid="reflect-lite" className="inline-block rounded-full border border-voice px-3 py-0.5 text-xs font-medium text-voice">
                {t("reflectLiteBadge")}
              </span>
            )}
          </p>
          <p data-testid="reflect-body" className="whitespace-pre-line text-text">
            {reflection.body}
          </p>
          {/* A crisis reply (it names Get help): its only action is that button
              (r1, UX), never "Write your answer". */}
          {onAnswer && !namesGetHelp(reflection.body) && (
            <button
              type="button"
              data-testid="reflect-answer"
              onClick={() => onAnswer(lastQuestion(reflection.body))}
              className={`mt-4 ${dialogButton(true)}`}
            >
              {t("reflectAnswer")}
            </button>
          )}
          {/* The crisis rule names the Get help button by its label
              (get-help-label.json = meGetHelpNow): then the button itself,
              opening the safety card (decision 124). */}
          {namesGetHelp(reflection.body) && (
            <div className="mt-4">
              <GetHelpNow country={country} testId="reflect-get-help" />
            </div>
          )}
          {creditsOut && (
            <p data-testid="reflect-credits-out" className="mt-3 text-sm text-muted">
              {t("creditsOut")}
            </p>
          )}
          <button
            type="button"
            data-testid="reflect-delete"
            aria-disabled={loading || deleting}
            onClick={() => !loading && !deleting && setConfirming(true)}
            className="mt-4 font-medium text-accent underline underline-offset-4 aria-disabled:opacity-50"
          >
            {t("reflectDelete")}
          </button>
          {deleteFailed && (
            <p role="alert" data-testid="reflect-delete-error" className="mt-2 text-sm font-medium text-accent">
              {tt("errGeneric")}
            </p>
          )}
        </div>
      )}

      {/* While Moodbow reads: the voice card with "Reading your entry…" and a
          moving bar (the mockups, decision 161). Visual only; the status
          below says it to screen readers. */}
      {!reflection && loading && (
        <div aria-hidden="true" data-testid="reflect-loading-card" className="mb-4 rounded-2xl border-l-4 border-voice bg-voice-surface p-4">
          <p className="text-sm font-medium text-voice">{ta("appName")}</p>
          <p className="mt-1 text-muted">{t("reflectLoading")}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-pill">
            <div className="h-full w-1/3 animate-[nav-progress_1.4s_ease-in-out_infinite] rounded-full bg-voice motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-40" />
          </div>
        </div>
      )}

      <div>
        {/* One reflection per entry in 1.0 (m9, UX): no Reflect while one
            exists, on any entry; deleting it brings Reflect back (and focus,
            above). */}
        {!reflection && (
          <button
            type="button"
            ref={reflectButton}
            data-testid="reflect-button"
            onClick={tap}
            // Focusable while a tap runs (disabling it dropped focus).
            aria-disabled={loading || deleting}
            className={`${dialogButton(true)} aria-disabled:opacity-50`}
          >
            {t("reflectButton")}
          </button>
        )}
        <p role="status" data-testid="reflect-status" className="mt-3 text-sm text-muted">
          {/* The card shows the wait; here it's for screen readers only. */}
          {loading ? <span className="sr-only">{t("reflectLoading")}</span> : said ? t(said) : null}
        </p>
        {phase.kind === "error" && (
          <p role="alert" data-testid="reflect-error" className="text-sm font-medium text-accent">
            {t(phase.message)}
          </p>
        )}
        {phase.kind === "offline" && (
          <div>
            <p role="alert" data-testid="reflect-error" className="text-sm font-medium text-accent">
              {t("errOffline")}
            </p>
            <button type="button" data-testid="reflect-retry" onClick={retrySameTap} className="mt-2 min-h-11 rounded-full border border-border px-4 text-sm font-medium text-text">
              {ta("tryAgain")}
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <Dialog title={t("reflectDeleteConfirmTitle")} body={t("reflectDeleteConfirmBody")} onCancel={closeConfirm} testId="reflect-delete-dialog">
          <button type="button" data-testid="reflect-delete-cancel" className={dialogButton()} onClick={closeConfirm}>
            {t("cancel")}
          </button>
          <button type="button" data-testid="reflect-delete-confirm" className={dialogButton(true)} onClick={() => void remove()}>
            {t("reflectDelete")}
          </button>
        </Dialog>
      )}
    </section>
  );
}
