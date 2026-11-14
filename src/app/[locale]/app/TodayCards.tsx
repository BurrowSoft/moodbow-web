"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { Link } from "@/i18n/navigation";
import { CHECKIN_SAVED_EVENT, isLowMood, type CheckInSavedDetail } from "@/lib/journal/checkInSaved";
import { markSetupLaterDone, readSetupLaterDone } from "@/lib/journal/setupLater";
import { PlusBanner } from "./me/PlusInMe";

// Today's Plus card on first landing (1.3 §6): the same card as Me's, closed for the day on either.
// The server decides whether it may show at all (free, Plus row read, nothing flagged or low saved
// today); a check-in saved here with one of the two lowest faces hides it at once.
export function TodayPlusCard({ trial, price, date }: { trial: boolean; price: string; date: string }) {
  const [low, setLow] = useState(false);
  useEffect(() => {
    const onSaved = (e: Event) => {
      const d = (e as CustomEvent<CheckInSavedDetail>).detail;
      if (d?.date === date && isLowMood(d.mood)) setLow(true);
    };
    window.addEventListener(CHECKIN_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(CHECKIN_SAVED_EVENT, onSaved);
  }, [date]);
  if (low) return null;
  return <PlusBanner trial={trial} price={price} id="today-plus-card" tryId="today-plus-try" />;
}

// Setup after first use (1.3 §6): offered once there's a check-in, while the reminder is still off
// (the protective default). Gone for good on this device once it's closed or Setup is opened.
const noSubscribe = () => () => {};

export function SetupLaterCard() {
  const t = useTranslations("today");
  const to = useTranslations("onboarding");
  // Hidden in the server's HTML (no storage there), so it never flashes for someone who closed it.
  const done = useSyncExternalStore(noSubscribe, readSetupLaterDone, () => true);
  const [closed, setClosed] = useState(false);
  if (done || closed) return null;
  return (
    <section aria-labelledby="today-setup-later-title" data-testid="today-setup-later" className="space-y-3 rounded-3xl border border-border bg-surface p-[20px]">
      <h2 id="today-setup-later-title" className="text-lg font-medium text-text">
        {to("setupTitle")}
      </h2>
      <p>{t("setupLaterBody")}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/setup" data-testid="today-setup-later-open" onClick={markSetupLaterDone} className={dialogButton(true)}>
          {t("setupLaterOpen")}
        </Link>
        <button
          type="button"
          data-testid="today-setup-later-close"
          onClick={() => {
            markSetupLaterDone();
            setClosed(true);
          }}
          className={dialogButton()}
        >
          {t("setupLaterClose")}
        </button>
      </div>
    </section>
  );
}
