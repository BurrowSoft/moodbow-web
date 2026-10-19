"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { GetHelpNow } from "@/components/SafetyCard";
import getHelpLabel from "../../../../../content/contracts/get-help-label.json";
import { IN_PROGRESS_LIMIT_MS, IN_PROGRESS_RETRY_MS, type Reflection, type ReflectErrorKey } from "@/lib/journal/reflect";
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

const wait = (ms: number) => new Promise((done) => window.setTimeout(done, ms));
const isRedirect = (e: unknown) => typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT");

// "Reflect with Moodbow" under a saved entry (M9, specs/m9-ai-reflections.md;
// reflect.md). Shown only when canReflect(me). One reflection per entry;
// reflecting again replaces it. Each tap has its own client_key, resent
// unchanged on every retry of that tap; the button is disabled while a tap
// is in flight. The body is shown as plain text with its line breaks
// (decision 120), never as HTML.
export function ReflectPanel({ entryId, initial, balance, country }: { entryId: string; initial: Reflection | null; balance: number; country?: string | null }) {
  const t = useTranslations("ai");
  const tm = useTranslations("me");
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
    setPhase({ kind: "loading" });
    const started = Date.now();
    for (;;) {
      let result;
      try {
        result = await reflectOnEntry(entryId, key);
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
      setReflection(result.reflection);
      if (result.balance !== null) {
        setCreditsOut(lastBalance.current > 0 && result.balance <= 0);
        lastBalance.current = result.balance;
      }
      setPhase({ kind: "idle" });
      return;
    }
  };

  const tap = () => {
    if (phase.kind === "loading") return;
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
    } else setDeleteFailed(true);
  };

  if (hidden) return null;
  const loading = phase.kind === "loading";

  return (
    <section aria-labelledby="reflect-title" className="mt-8 rounded-3xl border border-border bg-surface p-6" data-testid="reflect-panel">
      <h2 id="reflect-title" className="sr-only">
        {t("reflectButton")}
      </h2>
      {reflection && (
        <div data-testid="reflect-result">
          {reflection.tier === "lite" && (
            <span data-testid="reflect-lite" className="mb-2 inline-block rounded-full bg-pill px-3 py-0.5 text-xs font-medium text-accent">
              {t("reflectLiteBadge")}
            </span>
          )}
          <p data-testid="reflect-body" className="whitespace-pre-line text-text">
            {reflection.body}
          </p>
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
            disabled={loading || deleting}
            onClick={() => setConfirming(true)}
            className="mt-4 font-medium text-accent underline underline-offset-4 disabled:opacity-50"
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

      <div className={reflection ? "mt-6" : ""}>
        <button
          type="button"
          data-testid="reflect-button"
          onClick={tap}
          disabled={loading || deleting}
          aria-busy={loading}
          className={`${dialogButton(!reflection)} disabled:opacity-50`}
        >
          {t("reflectButton")}
        </button>
        <p role="status" data-testid="reflect-status" className="mt-3 text-sm text-muted">
          {loading ? t("reflectLoading") : null}
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
