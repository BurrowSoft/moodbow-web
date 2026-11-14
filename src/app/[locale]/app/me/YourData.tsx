"use client";

import { startTransition, useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { Link } from "@/i18n/navigation";
import { LockedItem, type PlusOffer } from "../PlusSheet";
import { canRenderText, renderExportText, type Translate } from "@/lib/exportText";
import { renderExportCsv } from "@/lib/exportCsv";
import { csvFileName, deleteWordTyped, exportFileName, journalFileName } from "@/lib/journal/account";
import { wipeLocalData } from "@/lib/localData";
import { EXPORT_WAIT_MS, withTimeout } from "@/lib/ui/withTimeout";
import { deleteMyAccount, exportMyData, exportPictureUrls, type DeleteAccountState } from "./actions";

type ExportFile = { kind: "txt" | "json" | "csv" | "zip"; name: string; url: string };
const LINK_LABELS = { txt: "exportReadable", json: "exportData", csv: "exportCsv", zip: "exportZip" } as const;

// Pictures (035): the data file with the pictures themselves, zipped in the browser (stored, not
// compressed: JPEGs don't shrink). pictures/<entry_id>/<picture_id>.jpg beside the JSON.
async function zipWithPictures(json: string, jsonName: string): Promise<Blob | null> {
  const listed = await exportPictureUrls().catch(() => null);
  if (!listed || listed.status !== "ok") return null;
  if (listed.pictures.length === 0) return null;
  const { zipSync, strToU8 } = await import("fflate");
  const files: Record<string, [Uint8Array, { level: 0 }]> = { [jsonName]: [strToU8(json), { level: 0 }] };
  for (const p of listed.pictures) {
    const res = await fetch(p.url);
    if (!res.ok) return null;
    files[`pictures/${p.entry_id}/${p.id}.jpg`] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }];
  }
  return new Blob([zipSync(files)], { type: "application/zip" });
}
const zipFileName = (date: string) => `moodbow-export-${date}.zip`;
const hasPictures = (doc: unknown) =>
  Array.isArray((doc as { entries?: unknown })?.entries) && (doc as { entries: { pictures?: unknown }[] }).entries.some((e) => Array.isArray(e?.pictures) && e.pictures.length > 0);

// Me → Your data (M7): Export my data, and Delete account behind a dialog
// that warns about lost AI credits, offers the export first, and needs
// DELETE typed. The credits line only once AI is live (ai: "ai-live" met)
// and there are some: text = enforcement, as the Help article's
// {pending:ai_live} clause (UX, the Web Tester's forced pass). csv: the
// spreadsheet link (1.1 P, export-csv-live).
export function YourData({ credits, uid, csv = false, ai = false, plusSource = null, pdf = null, pictures = false }: { credits: number; uid: string; csv?: boolean; ai?: boolean; plusSource?: "stripe" | "play" | "apple" | null; pdf?: "plus" | PlusOffer | null; pictures?: boolean }) {
  const t = useTranslations("me");
  const tp = useTranslations("plus");
  const tt = useTranslations("today");
  const locale = useLocale();
  const [exporting, startExport] = useTransition();
  const [exportState, setExportState] = useState<"idle" | "ready" | "error">("idle");
  // Pictures (035): the zip couldn't be made (the rest of the export stands).
  const [zipFailed, setZipFailed] = useState(false);
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
        setZipFailed(false);
        const result = await withTimeout(exportMyData(), EXPORT_WAIT_MS);
        if (result.status !== "ok") return setExportState("error");
        const doc: unknown = JSON.parse(result.json);
        const next: ExportFile[] = [];
        // Only a format the renderer knows becomes text; the JSON always.
        if (canRenderText(doc)) {
          next.push({ kind: "txt", name: journalFileName(result.date), url: URL.createObjectURL(new Blob([renderExportText(doc, tr as Translate)], { type: "text/plain;charset=utf-8" })) });
        }
        next.push({ kind: "json", name: exportFileName(result.date), url: URL.createObjectURL(new Blob([result.json], { type: "application/json" })) });
        // Pictures (035): the zip, when there are any and pictures are on here. Can't be made: the
        // export still stands without it, and says the pictures are missing.
        // Whenever the JSON lists pictures, whatever pictures-live says (the Reviewer, #322).
        if (hasPictures(doc)) {
          const zip = await zipWithPictures(result.json, exportFileName(result.date));
          if (zip) next.push({ kind: "zip", name: zipFileName(result.date), url: URL.createObjectURL(zip) });
          else setZipFailed(true);
        }
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
      {exportState === "ready" && zipFailed && (
        <p role="alert" data-testid="me-export-zip-failed" className="text-sm text-text">
          {t("exportZipFailed")}
        </p>
      )}
    </div>
  );

  const closeDelete = useCallback(() => {
    setDeleting(false);
    setTyped("");
  }, []);

  return (
    <section aria-labelledby="me-your-data" className="rounded-3xl border border-border bg-surface p-[24px]">
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
      {/* Moodbow Plus: the designed PDF journal (decision 246). The CSV export stays free. */}
      {pdf === "plus" ? (
        <Link href="/app/me/journal-pdf" data-testid="me-journal-pdf" className="mt-4 inline-flex min-h-11 max-w-full items-center font-medium text-accent underline underline-offset-4 [overflow-wrap:anywhere]">
          {tp("rowPdf")}
        </Link>
      ) : (
        pdf && <LockedItem label={tp("rowPdf")} sheetTitle={tp("sheetPdf")} offer={pdf} testId="me-journal-pdf" className="mt-4 flex min-h-11 w-full max-w-full items-center justify-between gap-3 text-left font-medium text-text" />
      )}
      <button type="button" data-testid="me-delete" onClick={() => setDeleting(true)} className="mt-6 max-w-full font-medium text-accent underline underline-offset-4 [overflow-wrap:anywhere]">
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
            {/* Moodbow Plus (UX, #270): only to someone with that source. On the web a
                Stripe subscription is cancelled with the account; a store's isn't. */}
            {plusSource && (
              <p className="font-medium text-text" data-testid="delete-plus">
                {plusSource === "stripe" ? tp("deleteStripe") : tp("deleteStore")}
              </p>
            )}
            <button type="button" data-testid="delete-export-first" onClick={runExport} aria-disabled={exporting} className="max-w-full font-medium text-accent underline underline-offset-4 [overflow-wrap:anywhere] aria-disabled:opacity-60">
              {t("deleteExportFirst")}
            </button>
            {exportResult}
            <div>
              <label htmlFor="delete-confirm" className="block leading-[1.429] [font-size:min(0.875rem,max(8.75vw,28px))] font-medium text-text">
                {t("deleteTypeConfirm", { word: t("deleteWord") })}
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
                className="mt-2 block w-full rounded-2xl border border-border bg-bg px-[16px] py-3 text-text"
              />
            </div>
            {state.status === "error" && (
              <p role="alert" data-testid="delete-error" className="font-medium text-accent">
                {state.error === "plus_cancelled" ? tp("deleteCancelledKept") : tt("errGeneric")}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" data-testid="delete-cancel" onClick={closeDelete} className={dialogButton()}>
                {t("cancel")}
              </button>
              <button type="submit" data-testid="delete-confirm" disabled={!deleteWordTyped(typed, locale) || pending} className={`${dialogButton(true)} disabled:opacity-50`}>
                {t("deleteConfirm")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
