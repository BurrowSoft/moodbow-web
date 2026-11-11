"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { Link } from "@/i18n/navigation";
import type { PlusView } from "@/lib/plus/view";

// Free rows, then what Plus adds (UX, 11 Nov: today's free ranges and
// patterns stay free). The AI rows only while AI is shown.
const FREE_ROWS = ["rowJournal", "rowHelp", "rowOwn", "rowRanges", "rowPatterns", "rowData"] as const;
const PLUS_ROWS = ["rowYear", "rowMorePatterns", "rowReview", "rowThemes", "rowPdf"] as const;

function Tick({ label, plus }: { label: string; plus?: boolean }) {
  return (
    <svg role="img" aria-label={label} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`mx-auto ${plus ? "text-accent" : "text-text"}`}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
function Lock({ label }: { label: string }) {
  return (
    <svg role="img" aria-label={label} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-muted">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// The Plus screen (decision 246, mockups 2 and 2b): the table scrolls in its
// own box with its scrollbar always shown (overflow-y: scroll), and the
// footer with the price and the one button never scrolls, so the action is
// in view on landing at any size. No first-charge date, no countdown, no
// pre-ticked box: Stripe's own page confirms the terms.
export function PlusScreen({ view, price, aiShown, started }: { view: PlusView; price: string; aiShown: boolean; started: boolean }) {
  const t = useTranslations("plus");
  const tt = useTranslations("today");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitedLong, setWaitedLong] = useState(false);
  const has = view.kind === "plus";
  const waiting = started && !has;

  // Back from Stripe before the webhook landed: look again for about 20 s,
  // then a calm line (UX: no error tone).
  useEffect(() => {
    if (!waiting) return;
    const tick = setInterval(() => router.refresh(), 2_000);
    const long = setTimeout(() => {
      clearInterval(tick);
      setWaitedLong(true);
    }, 20_000);
    return () => {
      clearInterval(tick);
      clearTimeout(long);
    };
  }, [waiting, router]);

  const go = async (path: "/api/checkout/stripe" | "/api/billing/portal") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale }) });
      const body = (await res.json().catch(() => ({}))) as { url?: string; code?: string };
      if (body.url) {
        window.location.assign(body.url);
        return;
      }
      setError(body.code === "needs_email" ? t("needsEmail") : tt("errGeneric"));
    } catch {
      setError(tt("errGeneric"));
    }
    setBusy(false);
  };

  const rows = [...FREE_ROWS, ...(aiShown ? (["rowAiFree"] as const) : [])].map((k) => ({ k, free: true }));
  const plusRows = [...PLUS_ROWS, ...(aiShown ? (["rowAiPlus"] as const) : [])].map((k) => ({ k, free: false }));

  return (
    <div data-testid="plus-screen" className="flex h-[calc(100dvh-7rem-max(16px,calc(56px-1rem)))] min-h-0 flex-col md:h-[calc(100dvh-5rem)]">
      <div data-testid="plus-scroll" tabIndex={0} aria-label={t("tableCaption")} className="min-h-0 flex-1 space-y-3 overflow-y-scroll pb-3 [scrollbar-width:thin]">
        <div className="space-y-1">
          <p className="text-sm font-medium tracking-wide text-accent uppercase">{t("label")}</p>
          <h1 data-testid="plus-title" className="font-medium leading-tight [font-size:min(1.375rem,max(11.25vw,36px))] [overflow-wrap:anywhere] sm:text-2xl">
            {has ? t("titleHas") : t("title")}
          </h1>
          <p className="text-sm text-muted">{t("lead")}</p>
        </div>
        <table data-testid="plus-table" className="w-full border-collapse overflow-hidden rounded-2xl bg-surface text-sm">
          <caption className="sr-only">{t("tableCaption")}</caption>
          <thead>
            <tr className="bg-pill">
              <th scope="col" className="px-[12px] py-2 text-left font-medium">
                <span className="sr-only">{t("colFeature")}</span>
              </th>
              <th scope="col" className="w-[3.5em] px-1 py-2 font-medium">
                {t("colFree")}
              </th>
              <th scope="col" className="w-[3.5em] px-1 py-2 font-medium text-accent">
                {t("colPlus")}
              </th>
            </tr>
          </thead>
          <tbody>
            {[...rows, ...plusRows].map(({ k, free }) => (
              <tr key={k} data-testid={`plus-row-${k}`} className="border-t border-border">
                <th scope="row" className="px-[12px] py-2 text-left font-normal [overflow-wrap:anywhere]">
                  {t(k)}
                </th>
                <td className="px-1 py-2">{free ? <Tick label={t("included")} /> : <Lock label={t("plusOnly")} />}</td>
                <td className="px-1 py-2">
                  <Tick label={t("included")} plus />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div data-testid="plus-footer" className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface px-[12px] pt-3 pb-2 text-center">
        {waiting ? (
          <p role="status" data-testid="plus-waiting" className="font-medium">
            {waitedLong ? t("onItsWay") : t("starting")}
          </p>
        ) : has ? (
          view.source === "stripe" ? (
            <button type="button" data-testid="plus-manage" disabled={busy} onClick={() => void go("/api/billing/portal")} className={dialogButton(true)}>
              {t("manage")}
            </button>
          ) : (
            <p data-testid="plus-manage-store" className="font-medium">
              {view.source === "play" ? t("managePlay") : t("manageApple")}
            </p>
          )
        ) : view.kind === "past_due" ? (
          <>
            <p className="text-sm">{t("pastDue")}</p>
            <button type="button" data-testid="plus-update-card" disabled={busy} onClick={() => void go("/api/billing/portal")} className={dialogButton(true)}>
              {t("updateCard")}
            </button>
          </>
        ) : (
          <>
            <p data-testid="plus-price" className="font-medium">
              {view.trial ? t("footerTrial", { price }) : t("priceYear", { price })}
            </p>
            <p className="text-sm text-muted">{t("renews")}</p>
            <button type="button" data-testid="plus-start" disabled={busy} onClick={() => void go("/api/checkout/stripe")} className={dialogButton(true)}>
              {view.trial ? t("startTrial") : t("start")}
            </button>
          </>
        )}
        {error && (
          <p role="alert" data-testid="plus-error" className="text-sm">
            {error}
          </p>
        )}
        {!has && (
          <Link href="/app/me" data-testid="plus-not-now" className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-accent underline underline-offset-4">
            {t("notNow")}
          </Link>
        )}
      </div>
    </div>
  );
}
