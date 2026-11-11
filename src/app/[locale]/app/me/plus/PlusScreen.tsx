"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { Link } from "@/i18n/navigation";
import type { PlusView } from "@/lib/plus/view";

// Free rows, then what Plus adds (UX, 11 Nov: today's free ranges and
// patterns stay free). The AI rows only while AI is shown.
const FREE_ROWS = ["rowJournal", "rowHelp", "rowOwn", "rowRanges", "rowPatterns", "rowData"] as const;
// rowBreathing: the toolbox's other ways to breathe (today's stays free; UX, 12 Nov).
const PLUS_ROWS = ["rowYear", "rowMorePatterns", "rowReview", "rowThemes", "rowPdf", "rowBreathing"] as const;

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

  // Large text (UX, 12 Nov, the Web Tester's long-language pass): when the whole footer would take
  // more than 40 % of the screen's height, the table was left a slit. Then the page scrolls as a
  // whole, the phone bar steps aside (a one-task page off Me, with Back), and only the price, the
  // renewal line and the main button stay pinned at the bottom; Not now and Manage go to the end
  // of the content. Measured with the full footer; measured again when the screen or the text size
  // changes. The same rule is the app's.
  const screen = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const [large, setLarge] = useState(false);
  const sizeKey = () => `${window.innerWidth}x${window.innerHeight}:${getComputedStyle(document.documentElement).fontSize}`;
  useLayoutEffect(() => {
    const root = screen.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    if (!large) {
      // The footer over 40 % of the screen, or the table left under a third of it (a member's
      // footer is one button, but at 300 % the box itself is small).
      const check = () => {
        const height = footer.current?.getBoundingClientRect().height ?? 0;
        const table = scroll.current?.getBoundingClientRect().height ?? 0;
        // Nothing laid out yet (or no layout at all): nothing to judge.
        if (table === 0 && height === 0) return;
        if (height > 0.4 * window.innerHeight || table < window.innerHeight / 3) setLarge(true);
      };
      check();
      const observer = new ResizeObserver(check);
      observer.observe(root);
      window.addEventListener("resize", check);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", check);
      };
    }
    // In large mode: back to measuring the full footer when the screen or text size changes.
    const entered = sizeKey();
    const changed = () => {
      if (sizeKey() !== entered) setLarge(false);
    };
    const observer = new ResizeObserver(changed);
    observer.observe(root);
    window.addEventListener("resize", changed);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", changed);
    };
  }, [large]);
  useEffect(() => {
    if (!large) return;
    const html = document.documentElement;
    html.dataset.tabsAside = "";
    return () => {
      delete html.dataset.tabsAside;
    };
  }, [large]);

  // The main action: what stays pinned at any size.
  const action = waiting ? (
    <p role="status" data-testid="plus-waiting" className="font-medium">
      {waitedLong ? t("onItsWay") : t("starting")}
    </p>
  ) : has ? null : view.kind === "past_due" ? (
    <>
      <p className="text-[0.875em]">{t("pastDue")}</p>
      <button type="button" data-testid="plus-update-card" disabled={busy} onClick={() => void go("/api/billing/portal")} className={dialogButton(true)}>
        {t("updateCard")}
      </button>
    </>
  ) : (
    <>
      {/* At large text the short price, one line: the button already names the free week. */}
      <p data-testid="plus-price" className={`font-medium ${large ? "leading-tight" : ""}`}>
        {view.trial && !large ? t("footerTrial", { price }) : t("priceYear", { price })}
      </p>
      {/* In em, so it follows the footer's cap at large text (the same size as before otherwise). */}
      <p data-testid="plus-renews" className={`text-[0.875em] text-muted ${large ? "leading-snug" : ""}`}>
        {t("renews")}
      </p>
      {/* At large text its lines sit closer (de: three lines at 32 px), so the content keeps room. */}
      <button type="button" data-testid="plus-start" disabled={busy} onClick={() => void go("/api/checkout/stripe")} className={`${dialogButton(true)} ${large ? "leading-tight" : ""}`}>
        {view.trial ? t("startTrial") : t("start")}
      </button>
    </>
  );
  // Manage (or where to manage it) and Not now: in the footer, or at the end of the content.
  const rest = (
    <>
      {has && !waiting ? (
        view.source === "stripe" ? (
          <button type="button" data-testid="plus-manage" disabled={busy} onClick={() => void go("/api/billing/portal")} className={dialogButton(true)}>
            {t("manage")}
          </button>
        ) : (
          <p data-testid="plus-manage-store" className="font-medium">
            {view.source === "play" ? t("managePlay") : t("manageApple")}
          </p>
        )
      ) : null}
      {!has && (
        <Link href="/app/me" data-testid="plus-not-now" className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-accent underline underline-offset-4">
          {t("notNow")}
        </Link>
      )}
    </>
  );
  const errorLine = error && (
    <p role="alert" data-testid="plus-error" className="text-sm">
      {error}
    </p>
  );
  const pinned = large ? action !== null || error : true;

  return (
    <div
      ref={screen}
      data-testid="plus-screen"
      data-large={large || undefined}
      className={
        large
          ? "flex flex-col"
          : "flex h-[calc(100dvh-var(--tab-bar-h,5.5rem)-1.5rem-max(16px,calc(56px-1rem)))] min-h-0 flex-col md:h-[calc(100dvh-5rem)]"
      }
    >
      <div
        ref={scroll}
        data-testid="plus-scroll"
        // Its own scroll area (a Tab stop, named) only while the footer splits the screen.
        tabIndex={large ? undefined : 0}
        aria-label={large ? undefined : t("tableCaption")}
        className={large ? "space-y-3 pb-3" : "min-h-0 flex-1 space-y-3 overflow-y-scroll pb-3 [scrollbar-width:thin]"}
      >
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
              <th scope="col" className="w-[3.5em] px-1 py-2 font-medium hyphens-auto [overflow-wrap:anywhere]">
                {t("colFree")}
              </th>
              <th scope="col" className="w-[3.5em] px-1 py-2 font-medium text-accent hyphens-auto [overflow-wrap:anywhere]">
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
        {large && (
          <div data-testid="plus-rest" className="flex flex-col items-center gap-2 pt-2 text-center">
            {rest}
          </div>
        )}
      </div>

      {pinned && (
        <div
          ref={footer}
          data-testid="plus-footer"
          // At large text: pinned, its text capped at 32 px (the 2x target, decision 231) and
          // its spacing in px, so it takes as little of the screen as it can.
          className={`flex shrink-0 flex-col border-t border-border bg-surface px-[12px] text-center ${
            large ? "sticky bottom-0 z-10 gap-[8px] pt-[12px] pb-[8px] [font-size:min(1rem,max(10vw,32px))]" : "gap-2 pt-3 pb-2"
          }`}
        >
          {action}
          {errorLine}
          {!large && rest}
        </div>
      )}
    </div>
  );
}
