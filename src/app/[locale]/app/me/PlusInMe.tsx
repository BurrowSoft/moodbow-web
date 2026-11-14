"use client";

import { useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { Link } from "@/i18n/navigation";
import type { PlusView } from "@/lib/plus/view";

// Moodbow Plus in Me (decision 246, mockups 1 and 5), below Get help now
// (help is always first). One of:
// - free: the banner; its close hides it for the rest of that day only;
// - the free week running: "Plus trial · {n} days left", 7 segments (the only
//   place the counter shows; no reminder, no first-charge date);
// - a failed renewal: the state line and Update card, only while it fails.
// Plus without a trial shows nothing here.

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

export function PlusInMe({ view, price }: { view: PlusView; price: string }) {
  const t = useTranslations("plus");
  const tt = useTranslations("today");
  const locale = useLocale();
  // Closed today on this device? The server's HTML has no storage, so it starts
  // hidden there and never flashes for someone who closed it. closedHere: a
  // browser with no storage still closes it for this visit.
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (view.kind === "plus") {
    if (view.daysLeft === null) return null;
    const day = 7 - view.daysLeft + 1;
    return (
      <section aria-labelledby="me-plus-trial" data-testid="me-plus-trial" className="space-y-3 rounded-2xl bg-pill p-[16px]">
        <div className="flex flex-wrap items-center gap-2">
          <Arcs />
          <h2 id="me-plus-trial" className="flex-1 font-medium">
            {t("trialTitle")}
          </h2>
          <span data-testid="me-plus-days-left" className="font-medium text-accent">
            {t("trialLeft", { n: view.daysLeft })}
          </span>
        </div>
        <div role="img" aria-label={t("trialDay", { day })} className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className={`h-1.5 rounded-full ${i < day ? "bg-accent" : "bg-border"}`} />
          ))}
        </div>
      </section>
    );
  }

  if (view.kind === "past_due") {
    const portal = async () => {
      setBusy(true);
      setFailed(false);
      try {
        const res = await fetch("/api/billing/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale }) });
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
        <p>{t("pastDue")}</p>
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

  return <PlusBanner trial={view.trial} price={price} id="me-plus-banner" tryId="me-plus-try" />;
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

export function PlusBanner({ trial, price, id, tryId }: { trial: boolean; price: string; id: string; tryId: string }) {
  const t = useTranslations("plus");
  const [closed, close] = useClosedToday();
  if (closed) return null;
  return (
    <section aria-labelledby={id} data-testid={id} className="relative space-y-2 rounded-3xl bg-pill p-[20px]">
      <button
        type="button"
        aria-label={t("bannerClose")}
        data-testid={`${id}-close`}
        onClick={close}
        className="absolute top-2 right-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div className="flex items-center gap-2 pr-12">
        <Arcs />
        <span className="text-sm font-medium tracking-wide text-accent uppercase">{t("label")}</span>
      </div>
      <h2 id={id} className="pr-12 text-lg font-medium leading-snug">
        {t("bannerTitle")}
      </h2>
      <p>{t("bannerBody")}</p>
      <Link href="/app/me/plus" data-testid={tryId} className={`${dialogButton(true)} w-full`}>
        {trial ? t("tryFree") : t("seePlus")}
      </Link>
      <p className="text-center text-sm text-muted">{trial ? t("thenPrice", { price }) : t("priceYear", { price })}</p>
    </section>
  );
}
