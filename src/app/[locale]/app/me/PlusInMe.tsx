"use client";

import { useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { Link } from "@/i18n/navigation";
import type { PlusOfferPrices } from "@/lib/plus/page";
import type { PlusView } from "@/lib/plus/view";
import { FESTIVE_CARD, Lights, Tree } from "../PlusSheet";
import { SAVE_WAIT_MS } from "@/lib/ui/withTimeout";

// Moodbow Plus in Me (decision 246, mockups 1 and 5), below Get help now
// (help is always first). One of:
// - free: the banner; its close hides it for the rest of that day only;
// - the free week running: "Plus trial · {n} days left", 7 segments (the only
//   place the counter shows; no reminder, no first-charge date);
// - a pending cancel (042's cancel_at, UX 20 Nov, so a cancel in the portal visibly worked): "Plus trial · ends
//   {date} · won't renew" in place of the counter, or "Plus · ends {date} · won't renew" for paid Plus;
// - a failed renewal: the state line and Update card, only while it fails ("to keep Plus" inside the 7-day grace,
//   "to get Plus back" after it).
// Paid Plus that renews shows nothing here.

// The won't-renew date: day and month in the person's own format and time zone (the server and the browser format it
// the same way), with the year when it isn't this one; UTC for a zone this runtime doesn't know. Its spaces are
// no-break spaces, so the date never splits across lines ("26." / "November" at de 360/200, UX 20 Nov); the line
// still wraps between its "·" parts.
const NBSP = String.fromCharCode(0xa0);
export function endsOnLabel(iso: string, dateLocaleTag: string, timeZone: string, now = Date.now()): string {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const at = new Date(iso);
  const year = (d: Date) => new Intl.DateTimeFormat("en", { year: "numeric", timeZone: zone }).format(d);
  const label = new Intl.DateTimeFormat(dateLocaleTag, { day: "numeric", month: "long", ...(year(at) === year(new Date(now)) ? {} : { year: "numeric" }), timeZone: zone }).format(at);
  return label.split(" ").join(NBSP);
}

const CLOSED_KEY = "moodbow.plusBannerClosed";
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// Another tab closing it, or this one: read again.
const CLOSED_EVENT = "moodbow:plus-banner-closed";
const subscribeClosed = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(CLOSED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CLOSED_EVENT, onChange);
  };
};
const readClosed = (): string | null => {
  try {
    return window.localStorage.getItem(CLOSED_KEY);
  } catch {
    return null;
  }
};

function Arcs() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-accent">
      <path d="M3 18a9 9 0 0 1 18 0" />
      <path d="M6.5 18a5.5 5.5 0 0 1 11 0" />
      <path d="M10 18a2 2 0 0 1 4 0" />
    </svg>
  );
}

export function PlusInMe({
  view,
  price,
  offer = null,
  dateLocaleTag = "en-GB",
  timeZone = "UTC",
}: {
  view: PlusView;
  price: string;
  offer?: PlusOfferPrices | null;
  dateLocaleTag?: string;
  timeZone?: string;
}) {
  const t = useTranslations("plus");
  const tt = useTranslations("today");
  const locale = useLocale();
  // Closed today on this device? The server's HTML has no storage, so it starts
  // hidden there and never flashes for someone who closed it. closedHere: a
  // browser with no storage still closes it for this visit.
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (view.kind === "plus" && !view.paymentFailed) {
    const ends = view.endsAt ? endsOnLabel(view.endsAt, dateLocaleTag, timeZone) : null;
    if (view.daysLeft === null) {
      if (!ends) return null;
      // Paid Plus that won't renew: when it ends, so the cancel visibly worked.
      return (
        <section aria-label={t("label")} data-testid="me-plus-ends" className="flex items-center gap-2 rounded-2xl bg-pill p-[16px]">
          <Arcs />
          <p className="min-w-0 flex-1 font-medium">{t("endsWontRenew", { date: ends })}</p>
        </section>
      );
    }
    const day = 7 - view.daysLeft + 1;
    return (
      <section aria-labelledby="me-plus-trial" data-testid="me-plus-trial" className="space-y-3 rounded-2xl bg-pill p-[16px]">
        <div className="flex flex-wrap items-center gap-2">
          <Arcs />
          {ends ? (
            // A trial that won't turn into a paid year: when it ends, in place of the counter.
            <h2 id="me-plus-trial" data-testid="me-plus-trial-ends" className="min-w-0 flex-1 font-medium">
              {t("trialEndsWontRenew", { date: ends })}
            </h2>
          ) : (
            <>
              <h2 id="me-plus-trial" className="flex-1 font-medium">
                {t("trialTitle")}
              </h2>
              <span data-testid="me-plus-days-left" className="font-medium text-accent">
                {t("trialLeft", { n: view.daysLeft })}
              </span>
            </>
          )}
        </div>
        <div role="img" aria-label={t("trialDay", { day })} className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className={`h-1.5 rounded-full ${i < day ? "bg-accent" : "bg-border"}`} />
          ))}
        </div>
      </section>
    );
  }

  // A failed Stripe renewal: the same card inside the 7-day grace (Plus still on, UX 19 Nov), "Your last payment didn't
  // go through. Update your card to keep Plus.", and after it (Plus off) "… Update your card to get Plus back."
  // (UX, sw14 6b: never "keep" a Plus that's already off).
  if (view.kind === "past_due" || (view.kind === "plus" && view.paymentFailed)) {
    const portal = async () => {
      setBusy(true);
      setFailed(false);
      try {
        // A dead connection ends at SAVE_WAIT_MS as the error line (audit D).
        const res = await fetch("/api/billing/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale }), signal: AbortSignal.timeout(SAVE_WAIT_MS) });
        const body = (await res.json().catch(() => ({}))) as { url?: string };
        if (body.url) return window.location.assign(body.url);
      } catch {
        // falls through to the error line
      }
      setFailed(true);
      setBusy(false);
    };
    return (
      <section aria-label={t("label")} data-testid="me-plus-past-due" className="space-y-3 rounded-2xl bg-pill p-[16px]">
        <p data-testid="me-plus-past-due-line">{view.kind === "past_due" ? t("pastDueLapsed") : t("pastDue")}</p>
        <button type="button" data-testid="me-plus-update-card" disabled={busy} onClick={() => void portal()} className={dialogButton(true)}>
          {t("updateCard")}
        </button>
        {failed && (
          <p role="alert" className="text-sm">
            {tt("errGeneric")}
          </p>
        )}
      </section>
    );
  }

  if (view.kind !== "free") return null;
  return <PlusBanner trial={view.trial} price={price} offer={offer} id="me-plus-banner" tryId="me-plus-try" />;
}

// The free banner (decision 246): Me's, and Today's card on first landing (1.3 §6). Close hides it
// for the rest of that day on this device, on both. The server's HTML starts hidden (no storage
// there), so it never flashes for someone who closed it. closedHere: no storage, closed for this visit.
// Closed for the rest of today on this device, on Me and Today alike. The server's HTML has no
// storage, so it starts hidden and never flashes for someone who closed it.
export function useClosedToday(): [boolean, () => void] {
  const closedToday = useSyncExternalStore(subscribeClosed, () => readClosed() === localDay(), () => true);
  const [closedHere, setClosedHere] = useState(false);
  const close = () => {
    try {
      window.localStorage.setItem(CLOSED_KEY, localDay());
    } catch {
      // no storage: closed for this visit only
    }
    setClosedHere(true);
    window.dispatchEvent(new Event(CLOSED_EVENT));
  };
  return [closedToday || closedHere, close];
}

// The Christmas offer (1.3): the same card in its festive look, its own words and price.
// compact: Today's card during the offer (board 21b): no body, the tree, and a shorter small print.
export function PlusBanner({ trial, price, offer = null, id, tryId, compact = false }: { trial: boolean; price: string; offer?: PlusOfferPrices | null; id: string; tryId: string; compact?: boolean }) {
  const t = useTranslations("plus");
  const [closed, close] = useClosedToday();
  if (closed) return null;
  return (
    <section aria-labelledby={id} data-testid={id} data-offer={offer ? "" : undefined} className={`relative space-y-2 rounded-3xl p-[20px] ${offer ? FESTIVE_CARD : "bg-pill"}`}>
      <button
        type="button"
        aria-label={t("bannerClose")}
        data-testid={`${id}-close`}
        onClick={close}
        className={`absolute top-2 right-2 inline-flex h-[44px] w-[44px] items-center justify-center rounded-full ${offer ? "text-white" : "text-muted"}`}
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div className="flex items-center gap-2 pr-[48px]">
        {offer ? (
          <>
            {compact && <Tree />}
            <Lights />
          </>
        ) : (
          <Arcs />
        )}
        <span className={`text-sm font-medium tracking-wide uppercase ${offer ? "text-[#F3D27A]" : "text-accent"}`}>{offer ? t("offerLabel") : t("label")}</span>
      </div>
      <h2 id={id} className="pr-[48px] text-lg font-medium leading-snug">
        {offer ? t("offerBannerTitle", { offer: offer.firstYear }) : t("bannerTitle")}
      </h2>
      {!(offer && compact) && <p>{offer ? t("offerBannerBody") : t("bannerBody")}</p>}
      <Link href="/app/me/plus" data-testid={tryId} className={`${dialogButton(true)} w-full`}>
        {offer ? t("offerSee") : trial ? t("tryFree") : t("seePlus")}
      </Link>
      <p className={`text-center text-sm ${offer ? "text-white" : "text-muted"}`}>
        {offer ? t(compact ? "offerCardSmall" : "offerSmall", { price: offer.price }) : trial ? t("thenPrice", { price }) : t("priceYear", { price })}
      </p>
    </section>
  );
}
