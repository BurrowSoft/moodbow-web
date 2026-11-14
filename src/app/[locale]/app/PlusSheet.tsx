"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { Link } from "@/i18n/navigation";

// Moodbow Plus's lock and its sheet (decision 246, mockups 4): a locked item
// stays visible with the lock; a tap opens the sheet ("{feature} is part of
// Plus", Try 7 days free or See Plus, the price, Not now). Never on help, the
// safety plan, the crisis card or while writing: only the callers decide
// where, and none of those use it.

export function PlusLock({ size = 16 }: { size?: number }) {
  const t = useTranslations("plus");
  return (
    <svg role="img" aria-label={t("lock")} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export type PlusOffer = { trial: boolean; price: string };

export function PlusSheet({ title, offer, onClose, testId = "plus-sheet" }: { title: string; offer: PlusOffer; onClose: () => void; testId?: string }) {
  const t = useTranslations("plus");
  return (
    <Dialog
      title={title}
      body={t("bannerBody")}
      details={<p className="text-sm text-muted" data-testid="plus-sheet-price">{offer.trial ? t("thenPrice", { price: offer.price }) : t("priceYear", { price: offer.price })}</p>}
      onCancel={onClose}
      testId={testId}
    >
      <Link href="/app/me/plus" data-testid="plus-sheet-go" className={dialogButton(true)}>
        {offer.trial ? t("tryFree") : t("seePlus")}
      </Link>
      <button type="button" data-testid="plus-sheet-not-now" onClick={onClose} className={dialogButton()}>
        {t("notNow")}
      </button>
    </Dialog>
  );
}

// A Plus item that stays visible, locked: its label and the lock; a tap opens the sheet.
export function LockedItem({ label, sheetTitle, offer, className, testId, children }: { label: string; sheetTitle: string; offer: PlusOffer; className: string; testId: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid={testId} data-locked="" onClick={() => setOpen(true)} className={className}>
        <span className="min-w-0">
          {label}
          {children}
        </span>
        <PlusLock />
      </button>
      {open && <PlusSheet title={sheetTitle} offer={offer} onClose={() => setOpen(false)} />}
    </>
  );
}
