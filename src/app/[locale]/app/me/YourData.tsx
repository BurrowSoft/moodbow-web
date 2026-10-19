"use client";

import { startTransition, useActionState, useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { DELETE_WORD, exportFileName } from "@/lib/journal/account";
import { wipeLocalData } from "@/lib/localData";
import { deleteMyAccount, exportMyData, type DeleteAccountState } from "./actions";

// Me → Your data (M7): Export my data, and Delete account behind a dialog
// that warns about lost AI credits (only when there are any), offers the
// export first, and needs DELETE typed.
export function YourData({ credits, uid }: { credits: number; uid: string }) {
  const t = useTranslations("me");
  const tt = useTranslations("today");
  const [exporting, startExport] = useTransition();
  const [exportState, setExportState] = useState<"idle" | "ready" | "error">("idle");
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

  // The file is made here, in the browser: nothing is stored on the way.
  const runExport = () =>
    startExport(async () => {
      try {
        const result = await exportMyData();
        if (result.status !== "ok") return setExportState("error");
        const url = URL.createObjectURL(new Blob([result.json], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = exportFileName(result.date);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setExportState("ready");
      } catch {
        setExportState("error");
      }
    });

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
        <button type="button" data-testid="me-export" onClick={runExport} disabled={exporting} aria-busy={exporting} className={`${dialogButton()} gap-2`}>
          {exporting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none" aria-hidden="true" />}
          {t("meExport")}
        </button>
        <p className="text-sm text-muted">{t("meExportBody")}</p>
        <p role="status" data-testid="me-export-status" className="text-sm font-medium text-text">
          {exportState === "ready" ? t("meExportReady") : exportState === "error" ? tt("errGeneric") : null}
        </p>
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
            {credits > 0 && (
              <p className="font-medium text-text" data-testid="delete-credits">
                {t("deleteCredits", { credits })}
              </p>
            )}
            <button type="button" data-testid="delete-export-first" onClick={runExport} disabled={exporting} className="font-medium text-accent underline underline-offset-4">
              {t("deleteExportFirst")}
            </button>
            {exportState !== "idle" && (
              <p role="status" className="text-sm text-text">
                {exportState === "ready" ? t("meExportReady") : tt("errGeneric")}
              </p>
            )}
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
