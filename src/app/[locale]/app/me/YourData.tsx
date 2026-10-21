"use client";

import { startTransition, useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { canRenderText, renderExportText, type Translate } from "@/lib/exportText";
import { renderExportCsv } from "@/lib/exportCsv";
import { csvFileName, DELETE_WORD, exportFileName, journalFileName } from "@/lib/journal/account";
import { wipeLocalData } from "@/lib/localData";
import { EXPORT_WAIT_MS, withTimeout } from "@/lib/ui/withTimeout";
import { deleteMyAccount, exportMyData, type DeleteAccountState } from "./actions";

type ExportFile = { kind: "txt" | "json" | "csv"; name: string; url: string };
const LINK_LABELS = { txt: "exportReadable", json: "exportData", csv: "exportCsv" } as const;

// Me → Your data (M7): Export my data, and Delete account behind a dialog
// that warns about lost AI credits, offers the export first, and needs
// DELETE typed. The credits line only once AI is live (ai: "ai-live" met)
// and there are some: text = enforcement, as the Help article's
// {pending:ai_live} clause (UX, the Web Tester's forced pass). csv: the
// spreadsheet link (1.1 P, export-csv-live).
export function YourData({ credits, uid, csv = false, ai = false }: { credits: number; uid: string; csv?: boolean; ai?: boolean }) {
  const t = useTranslations("me");
  const tt = useTranslations("today");
  const [exporting, startExport] = useTransition();
  const [exportState, setExportState] = useState<"idle" | "ready" | "error">("idle");
  const [files, setFiles] = useState<ExportFile[]>([]);
  // The whole message tree, for the readable export's keys (lib/exportText).
  const tr = useTranslations();
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(async (prev, form) => {
    try {
      return await deleteMyAccount(prev, form);
    } catch (e) {
      // A redirect (done, or signed out) is the navigation itself.
      const digest = (e as { digest?: unknown })?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
        // Deleted: this user's local copies (pending check-ins, drafts) go
        // now, before the next page (decision 85). Only on success: a
        // failed delete must not lose them.
        if (digest.includes("signed_out=deleted")) {
          try {
            wipeLocalData(window.localStorage, uid);
          } catch {
            // storage unavailable: nothing was kept here either
          }
        }
        throw e;
      }
      return { status: "error", error: "generic" };
    }
  }, { status: "idle" });

  // The files are made here, in the browser: nothing is stored on the way.
  // One Export, then two links (UX): the readable copy and the data file,
  // and a third, the spreadsheet, where 1.1 P is live.
  // Ignored while one runs (the button stays focusable: aria-disabled).
  const runExport = () => {
    if (exporting) return;
    startExport(async () => {
      try {
        // No answer in 45 s: the export's error and Try again (the timeout audit).
        const result = await withTimeout(exportMyData(), EXPORT_WAIT_MS);
        if (result.status !== "ok") return setExportState("error");
        const doc: unknown = JSON.parse(result.json);
        const next: ExportFile[] = [];
        // Only a format the renderer knows becomes text; the JSON always.
        if (canRenderText(doc)) {
          next.push({ kind: "txt", name: journalFileName(result.date), url: URL.createObjectURL(new Blob([renderExportText(doc, tr as Translate)], { type: "text/plain;charset=utf-8" })) });
        }
        next.push({ kind: "json", name: exportFileName(result.date), url: URL.createObjectURL(new Blob([result.json], { type: "application/json" })) });
        // The spreadsheet (1.1 P): from the same document, no AI text.
        if (csv && canRenderText(doc)) {
          next.push({ kind: "csv", name: csvFileName(result.date), url: URL.createObjectURL(new Blob([renderExportCsv(doc, tr as Translate)], { type: "text/csv;charset=utf-8" })) });
        }
        setFiles(next);
        setExportState("ready");
      } catch {
        setExportState("error");
      }
    });
  };

  // The links' object URLs live until a new export or leaving the page.
  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), [files]);

  // The result: a status line that's always there (so it's announced
  // when it's filled), and the two links once the export is ready.
  const exportResult = (
    <div className="space-y-1">
      <p role="status" data-testid={exportState === "idle" ? undefined : "me-export-status"} className="text-sm font-medium text-text empty:hidden">
        {exportState === "ready" ? t("meExportReady") : exportState === "error" ? tt("errGeneric") : null}
      </p>
      {exportState === "ready" && (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.kind}>
              <a href={f.url} download={f.name} data-testid={`me-export-${f.kind}`} className="font-medium text-accent underline underline-offset-4">
                {t(LINK_LABELS[f.kind])}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const closeDelete = useCallback(() => {
    setDeleting(false);
    setTyped("");
  }, []);

  return (
    <section aria-labelledby="me-your-data" className="rounded-3xl border border-border bg-surface p-6">
      <h2 id="me-your-data" className="text-lg font-medium text-text">
        {t("meYourData")}
      </h2>
      <div className="mt-4 space-y-1">
        <button type="button" data-testid="me-export" onClick={runExport} aria-disabled={exporting} className={`${dialogButton()} gap-2 aria-disabled:opacity-60`}>
          {exporting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none" aria-hidden="true" />}
          {t("meExport")}
        </button>
        <p className="text-sm text-muted">{t("meExportBody")}</p>
        {!deleting && exportResult}
      </div>
      <button type="button" data-testid="me-delete" onClick={() => setDeleting(true)} className="mt-6 font-medium text-accent underline underline-offset-4">
        {t("meDelete")}
      </button>

      {deleting && (
        <Dialog title={t("deleteTitle")} body={t("deleteBody")} onCancel={closeDelete} testId="delete-dialog">
          <form
            className="w-full space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              startTransition(() => action(form));
            }}
          >
            {ai && credits > 0 && (
              <p className="font-medium text-text" data-testid="delete-credits">
                {t("deleteCredits", { credits })}
              </p>
            )}
            <button type="button" data-testid="delete-export-first" onClick={runExport} aria-disabled={exporting} className="font-medium text-accent underline underline-offset-4 aria-disabled:opacity-60">
              {t("deleteExportFirst")}
            </button>
            {exportResult}
            <div>
              <label htmlFor="delete-confirm" className="block text-sm font-medium text-text">
                {t("deleteTypeConfirm")}
              </label>
              <input
                id="delete-confirm"
                name="confirm"
                data-testid="delete-confirm-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="mt-2 block w-full rounded-2xl border border-border bg-bg px-4 py-3 text-text"
              />
            </div>
            {state.status === "error" && (
              <p role="alert" data-testid="delete-error" className="font-medium text-accent">
                {tt("errGeneric")}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" data-testid="delete-cancel" onClick={closeDelete} className={dialogButton()}>
                {t("cancel")}
              </button>
              <button type="submit" data-testid="delete-confirm" disabled={typed.trim() !== DELETE_WORD || pending} className={`${dialogButton(true)} disabled:opacity-50`}>
                {t("deleteConfirm")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
