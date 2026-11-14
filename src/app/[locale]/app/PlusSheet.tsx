"use client";

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

// A Plus item that stays visible, locked: its label and the lock; a tap opens the Plus screen (the
// sheet is retired, Vitor 14 Nov). sheetTitle and offer stay accepted for the branches that pass them.
export function LockedItem({ label, className, testId, children }: { label: string; sheetTitle?: string; offer?: PlusOffer; className: string; testId: string; children?: React.ReactNode }) {
  return (
    <Link href="/app/me/plus" data-testid={testId} data-locked="" className={className}>
      <span className="min-w-0">
        {label}
        {children}
      </span>
      <PlusLock />
    </Link>
  );
}

// The Christmas offer's look (1.3, boards 6 and 7): evergreen with gold, berry red and mint. White
// text on the evergreen is 7.6:1. The lights are decoration (aria-hidden).
export const FESTIVE_CARD = "bg-[#1E5B45] text-white";
export function Lights() {
  return (
    <svg aria-hidden="true" width="44" height="18" viewBox="0 0 44 18" className="shrink-0">
      <path d="M1 4 Q11 12 22 4 T43 4" fill="none" stroke="#F3D27A" strokeWidth="1.2" />
      <circle cx="6" cy="8" r="2.6" fill="#C8364A" />
      <circle cx="16" cy="9" r="2.6" fill="#F3D27A" />
      <circle cx="27" cy="8" r="2.6" fill="#8FD6B4" />
      <circle cx="38" cy="8" r="2.6" fill="#C8364A" />
    </svg>
  );
}
export function Tree() {
  return (
    <svg aria-hidden="true" width="22" height="26" viewBox="0 0 22 26" className="shrink-0">
      <path d="M11 1 L19 11 H15 L21 19 H1 L7 11 H3 Z" fill="#8FD6B4" />
      <rect x="9.5" y="19" width="3" height="5" fill="#F3D27A" />
      <circle cx="11" cy="2" r="1.6" fill="#F3D27A" />
    </svg>
  );
}
