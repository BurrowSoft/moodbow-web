"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { drawCard } from "@/lib/share/drawCard";
import { stripPngMetadata } from "@/lib/share/pngChunks";
import { cardFileName, formatMonth, LAYOUT, MIN_CHECK_INS, monthBands, THEMES, type CardFormat, type CardTheme } from "@/lib/share/moodbow";
import { loadMonthCheckIns } from "./shareActions";

// "My month's moodbow" (M10, specs/m10-share-card.md): preview first,
// always. The card is drawn here in the browser from the month's moods and
// only leaves it if the person shares or downloads it (decision 20). Only
// colours, the month, the count and their own optional line are on it.
export function ShareMonth({ month, dateLocaleTag, label }: { month: string; dateLocaleTag: string; label?: "shareButton" | "shareThisMonth" }) {
  const t = useTranslations("share");
  const tt = useTranslations("today");
  const tm = useTranslations("me");
  const [open, setOpen] = useState(false);
  const [colours, setColours] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [format, setFormat] = useState<CardFormat>("story");
  const [theme, setTheme] = useState<CardTheme>("light");
  const [line, setLine] = useState("");
  const [canShareFiles, setCanShareFiles] = useState(false);
  // The finished PNG, made when the preview has drawn (see send).
  const [file, setFile] = useState<File | null>(null);
  // The browser gave no PNG (or one the filter can't read): nothing to
  // share, and never the unfiltered bytes (reviewer #31).
  const [encodeFailed, setEncodeFailed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  // The loading line is filled a moment after the dialog opens: a live
  // region that appears with its text often isn't announced.
  const [sayLoading, setSayLoading] = useState(false);
  const start = () => {
    setOpen(true);
    setSayLoading(false);
    window.setTimeout(() => setSayLoading(true), 100);
    setColours(null);
    setFailed(false);
    // The page's current theme is the default: one chosen in Me →
    // Appearance (<html data-theme>, decision 133), else the system's.
    const chosen = document.documentElement.dataset.theme;
    setTheme(chosen === "dark" || chosen === "light" ? chosen : window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const probe = typeof File !== "undefined" ? new File([""], cardFileName(month), { type: "image/png" }) : null;
    setCanShareFiles(!!probe && typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    loadMonthCheckIns(month)
      .then((r) => (r.status === "ok" ? setColours(monthBands(r.checkIns, month)) : setFailed(true)))
      .catch(() => setFailed(true));
  };
  const close = useCallback(() => setOpen(false), []);

  const enough = colours !== null && colours.length >= MIN_CHECK_INS;
  const maxChars = LAYOUT[format].line.maxChars;

  // Draw (again) whenever something on the card changes.
  useEffect(() => {
    const el = canvas.current;
    if (!open || !enough || !el) return;
    let cancelled = false;
    setFile(null);
    setEncodeFailed(false);
    (async () => {
      const family = getComputedStyle(document.documentElement).getPropertyValue("--font-poppins").trim() || "sans-serif";
      await Promise.all([document.fonts?.load(`500 72px ${family}`), document.fonts?.load(`400 44px ${family}`)]).catch(() => undefined);
      const logo = new Image();
      logo.src = THEMES[theme].logo;
      // decode() where the browser has it; else the load event.
      await (typeof logo.decode === "function" ? logo.decode() : new Promise((done) => (logo.onload = logo.onerror = done))).catch(() => undefined);
      const ctx = el.getContext("2d");
      if (cancelled || !ctx) return;
      el.width = LAYOUT[format].width;
      el.height = LAYOUT[format].height;
      drawCard(ctx, {
        format,
        theme,
        colours: colours!,
        monthLabel: formatMonth(month, dateLocaleTag),
        daysLabel: t("shareDaysJournaled", { n: colours!.length }),
        line,
        fontFamily: `${family}, sans-serif`,
        logo: logo.complete && logo.naturalWidth > 0 ? logo : null,
      });
      // Pixels only: every chunk the browser's encoder adds is dropped
      // (lib/share/pngChunks.ts); the name is the month.
      el.toBlob(async (blob) => {
        if (cancelled) return;
        const png = blob ? stripPngMetadata(new Uint8Array(await blob.arrayBuffer())) : null;
        if (cancelled) return;
        if (png) setFile(new File([png as BlobPart], cardFileName(month), { type: "image/png" }));
        else setEncodeFailed(true);
      }, "image/png");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, enough, colours, format, theme, line, month, dateLocaleTag, t]);

  const download = (f: File) => {
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // share() is called right in the click (Safari only allows it during the
  // click's user activation), so the file is ready before: made when the
  // preview finishes drawing. Cancelling the sheet is nothing; any other
  // refusal falls back to a download.
  const send = () => {
    if (!file) return;
    if (!canShareFiles) return download(file);
    navigator.share({ files: [file] }).catch((e: unknown) => {
      if ((e as { name?: string })?.name !== "AbortError") download(file);
    });
  };

  const choice = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${active ? "bg-pill text-accent" : "text-muted hover:bg-pill"}`;

  return (
    <>
      <button type="button" data-testid="share-open" onClick={start} className={dialogButton()}>
        {t(label ?? "shareButton")}
      </button>
      {open && (
        <Dialog title={t("shareTitle")} onCancel={close} testId="share-dialog">
          <div className="w-full space-y-4 text-left">
            {/* Always there while the dialog is open, filled while loading, so
                it's announced (review of #46). */}
            <p role="status" className="sr-only" data-testid="share-loading">
              {sayLoading && colours === null && !failed ? t("shareLoading") : null}
            </p>
            <h3 className="font-medium text-text" data-testid="share-type-moodbow">
              {t("shareMoodbow")}
            </h3>
            {failed ? (
              <p role="alert" className="font-medium text-accent">
                {tt("errGeneric")}
              </p>
            ) : colours === null ? (
              <span className="block h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none" aria-hidden="true" />
            ) : !enough ? (
              <p data-testid="share-not-enough" className="text-muted">
                {t("shareNotEnough")}
              </p>
            ) : (
              <>
                <canvas
                  ref={canvas}
                  role="img"
                  aria-label={t("shareMoodbow")}
                  aria-describedby="share-preview-desc"
                  data-testid="share-preview"
                  className={`mx-auto block rounded-xl border border-border ${format === "story" ? "h-80 w-[180px]" : "h-60 w-60"}`}
                />
                {/* What the image says, for screen readers (the month, the count and the line). */}
                <p id="share-preview-desc" className="sr-only">
                  <span>{formatMonth(month, dateLocaleTag)}</span> <span>{t("shareDaysJournaled", { n: colours!.length })}</span> <span>{line}</span>
                </p>
                {/* Two choices, two named groups (decision 143). */}
                <div className="flex flex-wrap gap-2">
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("shareFormat")}>
                  <button type="button" data-testid="share-format-story" aria-pressed={format === "story"} onClick={() => setFormat("story")} className={choice(format === "story")}>
                    {t("shareStory")}
                  </button>
                  <button type="button" data-testid="share-format-square" aria-pressed={format === "square"} onClick={() => setFormat("square")} className={choice(format === "square")}>
                    {t("shareSquare")}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("shareTheme")}>
                  <button type="button" data-testid="share-theme-light" aria-pressed={theme === "light"} onClick={() => setTheme("light")} className={choice(theme === "light")}>
                    {t("shareThemeLight")}
                  </button>
                  <button type="button" data-testid="share-theme-dark" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")} className={choice(theme === "dark")}>
                    {t("shareThemeDark")}
                  </button>
                </div>
                </div>
                <label htmlFor="share-line" className="block text-sm font-medium text-text">
                  {t("shareAddLine")}
                </label>
                <input
                  id="share-line"
                  data-testid="share-line"
                  value={line}
                  maxLength={maxChars}
                  onChange={(e) => setLine(e.target.value.slice(0, maxChars))}
                  aria-describedby="share-line-count"
                  className="block w-full rounded-2xl border border-border bg-bg px-4 py-3 text-text"
                />
                {/* Shown always; announced only at 10 left and at 0, not on
                    every key (decision 143). */}
                <p id="share-line-count" data-testid="share-line-count" className="text-sm text-muted">
                  {t("shareLineCount", { count: maxChars - line.length })}
                </p>
                <p role="status" className="sr-only" data-testid="share-line-count-announce">
                  {maxChars - line.length === 10 || maxChars - line.length === 0 ? t("shareLineCount", { count: maxChars - line.length }) : null}
                </p>
                <p className="text-sm text-muted">{t("sharePrivacyNote")}</p>
                {encodeFailed && (
                  <p role="alert" data-testid="share-encode-failed" className="font-medium text-accent">
                    {tt("errGeneric")}
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-3">
                  <button type="button" data-testid="share-send" onClick={send} disabled={!file} className={`${dialogButton(true)} disabled:opacity-50`}>
                    {canShareFiles ? t("shareSend") : t("shareDownload")}
                  </button>
                </div>
              </>
            )}
          </div>
          {/* Always there (also while loading, or with nothing to share):
              where focus goes when the dialog opens, and a way out without
              Esc, e.g. for a touch screen reader (a11y pass). */}
          <button type="button" data-testid="share-close" className={dialogButton()} onClick={close}>
            {tm("cancel")}
          </button>
        </Dialog>
      )}
    </>
  );
}
