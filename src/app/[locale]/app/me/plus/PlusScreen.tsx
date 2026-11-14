"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { Link } from "@/i18n/navigation";
import type { PlusOfferPrices } from "@/lib/plus/page";
import type { PlusView } from "@/lib/plus/view";
import { FESTIVE_CARD, Lights, Tree } from "../../PlusSheet";

// Free rows, then what Plus adds: "your journal is free, Insights come with Plus" (Vitor, 14 Nov;
// specs/1.3-offer-review-voice-taps.md §2). No AI rows in any comparison: the AI allowance rules
// stay in the code, unadvertised. Nothing free today gets a lock (wording only). rowExtras: one row
// for the prompt library, the other ways to breathe and more reminders (UX, 14 Nov), never one each.
const FREE_ROWS = ["rowJournal", "rowTimeline", "rowHelp", "rowAppointment", "rowData"] as const;
const PLUS_ROWS = ["rowInsights", "rowMorePatterns", "rowReview", "rowLetters", "rowExtras", "rowPdf", "rowThemes"] as const;

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
// offer: the Christmas special (1.3), only while it runs and for someone eligible (the server decides).
export function PlusScreen({ view, price, offer = null, started }: { view: PlusView; price: string; offer?: PlusOfferPrices | null; started: boolean }) {
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

  const rows = FREE_ROWS.map((k) => ({ k, free: true }));
  const plusRows = PLUS_ROWS.map((k) => ({ k, free: false }));

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
  // Large mode, and even the compact pinned part would leave the content under 40 % (a short
  // screen at large text): nothing is pinned, and the page is one scroll ending with the price,
  // the renewal line and the button together (UX 12 Nov, specs/plus.md; the same rule as the app).
  const [unpinned, setUnpinned] = useState(false);
  const sizeKey =() => `${window.innerWidth}x${window.innerHeight}:${getComputedStyle(document.documentElement).fontSize}`;
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
    // In large mode: the compact pinned part over 60 % of the screen leaves the content under
    // 40 %, so it unpins (measured while pinned; kept until the screen or text size changes).
    const fits = () => {
      if (!unpinned && (footer.current?.getBoundingClientRect().height ?? 0) > 0.6 * window.innerHeight) setUnpinned(true);
    };
    fits();
    // Back to measuring the full footer when the screen or text size changes.
    const entered = sizeKey();
    const changed = () => {
      if (sizeKey() === entered) return;
      setUnpinned(false);
      setLarge(false);
    };
    const observer = new ResizeObserver(changed);
    observer.observe(root);
    window.addEventListener("resize", changed);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", changed);
    };
  }, [large, unpinned]);
  useEffect(() => {
    if (!large) return;
    const html = document.documentElement;
    html.dataset.tabsAside = "";
    // Unpinned: the price is in the page's flow at the end; no room to keep under it.
    if (unpinned) {
      return () => {
        delete html.dataset.tabsAside;
      };
    }
    // The pinned part is fixed at the bottom (UX, 12 Nov: on screen at every scroll position, the
    // site footer included), so the page keeps room under its end for it: the content and the
    // site footer scroll up clear of it, never under it.
    const body = document.body;
    const pinned = footer.current;
    const room = () => {
      body.style.paddingBottom = pinned ? `${Math.ceil(pinned.getBoundingClientRect().height)}px` : "";
    };
    room();
    const observer = typeof ResizeObserver === "undefined" || !pinned ? null : new ResizeObserver(room);
    if (pinned) observer?.observe(pinned);
    return () => {
      delete html.dataset.tabsAside;
      observer?.disconnect();
      body.style.paddingBottom = "";
    };
  }, [large, unpinned]);

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
  ) : offer ? (
    <>
      {/* The Christmas strip carries the offer's name (no kicker above the title). */}
      <div data-testid="plus-offer-strip" className={`flex items-center gap-[12px] rounded-2xl px-[12px] py-[8px] text-left ${FESTIVE_CARD}`}>
        <Tree />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-[#F3D27A]">{t("offerLabel")}</span>
          <span className="block text-[0.875em]">{t("offerStripBody")}</span>
        </span>
        <Lights />
      </div>
      {/* Dropped on small screens and at large text: the button already says it (Vitor). */}
      {!large && (
        <p data-testid="plus-price" className="font-medium">
          {t("offerFirstYear", { offer: offer.firstYear })}
        </p>
      )}
      <button type="button" data-testid="plus-start" disabled={busy} onClick={() => void go("/api/checkout/stripe")} className={`${dialogButton(true)} ${large ? "leading-tight" : ""}`}>
        {t("offerButton", { offer: offer.firstYear })}
      </button>
      {/* The renewal, at body size, right under the button (the ruling). */}
      <p data-testid="plus-renews" className={large ? "leading-snug" : ""}>
        {t("offerThen", { price: offer.price })}
      </p>
      {!large && (
        <p data-testid="plus-cancel" className="text-[0.875em] text-muted">
          {t("cancelWhere")}
        </p>
      )}
    </>
  ) : (
    <>
      {/* At large text the short price, one line: the button already names the free week. */}
      <p data-testid="plus-price" className={`font-medium ${large ? "leading-tight" : ""}`}>
        {view.trial && !large ? t("footerTrial", { price }) : t("priceYear", { price })}
      </p>
      {/* At large text its lines sit closer (de: three lines at 32 px), so the content keeps room.
          The order (UX, the Web Tester's board comparison): the price, the button, the renewal
          line under it, then where to cancel. */}
      <button type="button" data-testid="plus-start" disabled={busy} onClick={() => void go("/api/checkout/stripe")} className={`${dialogButton(true)} ${large ? "leading-tight" : ""}`}>
        {view.trial ? t("startTrial") : t("start")}
      </button>
      {/* In em, so it follows the footer's cap at large text (the same size as before otherwise). */}
      <p data-testid="plus-renews" className={`text-[0.875em] text-muted ${large ? "leading-snug" : ""}`}>
        {t("renews")}
      </p>
      {/* Where to cancel (the Reviewer's ruling): here, or at the end of the content at large text,
          where the pinned part keeps only the price, the button and the renewal. */}
      {!large && (
        <p data-testid="plus-cancel" className="text-[0.875em] text-muted">
          {t("cancelWhere")}
        </p>
      )}
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
      {!has && large && (
        <p data-testid="plus-cancel" className="text-sm text-muted">
          {t("cancelWhere")}
        </p>
      )}
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
      data-unpinned={(large && unpinned) || undefined}
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
        <div className="relative space-y-1 pr-[48px]">
          {/* Close (all sizes, offer or not): on the title's row, where Back was; Not now and the
              browser's Back still leave too (UX, 14 Nov). */}
          <Link href="/app/me" aria-label={t("close")} data-testid="plus-close" className="absolute top-0 right-0 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
          {/* At large text the eyebrow is for screen readers only and the title at the 32 px cap, so
              the whole title is in view on landing above the pinned part (UX, 12 Nov: de put it at
              304, then 220-300 under a pinned top of 276; the price and button say it's Plus).
              During the offer there's none: the footer's Christmas strip carries it (Vitor). */}
          {!offer && (
            <p data-testid="plus-eyebrow" className={large ? "sr-only" : "text-sm font-medium tracking-wide text-accent uppercase"}>
              {t("label")}
            </p>
          )}
          <h1
            data-testid="plus-title"
            className={`font-medium leading-tight [overflow-wrap:anywhere] ${large ? "[font-size:min(1.375rem,max(10vw,32px))]" : "[font-size:min(1.375rem,max(11.25vw,36px))] sm:text-2xl"}`}
          >
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
            large ? `${unpinned ? "" : "fixed inset-x-0 bottom-0 z-20 "}gap-[8px] pt-[12px] pb-[8px] [font-size:min(1rem,max(10vw,32px))]` : "gap-2 pt-3 pb-2"
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
