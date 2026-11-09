"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { dialogButton } from "@/components/Dialog";
import { localKey } from "@/lib/localData";
import { subscribeTodayMood, todayMoodFor } from "@/lib/journal/todayMood";
import { toolboxCardShows, type ToolboxItem } from "@/lib/journal/toolbox";
import { Breathing } from "./me/toolbox/Breathing";

const listeners = new Set<() => void>();
const subscribeHidden = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const hiddenFor = (key: string) => {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

// Things that help you (1.2): a gentle card on Today when the latest check-in saved today
// is low (content/toolbox.json). It follows the check-in card, so it never comes before
// a help offer (the Reviewer's read). Not now hides it for today, in this browser only.
// The person's own items, and a minute to breathe; with none yet, a way to add one.
export function ToolboxCard({ uid, today, todayMood, items }: { uid: string; today: string; todayMood: number | null; items: ToolboxItem[] }) {
  const t = useTranslations("toolbox");
  const key = localKey("toolbox-card-hidden", uid, today);
  const mood = useSyncExternalStore(subscribeTodayMood, () => todayMoodFor(today, todayMood), () => todayMood);
  const hidden = useSyncExternalStore(subscribeHidden, () => hiddenFor(key), () => false);
  const [breathing, setBreathing] = useState(false);
  const notNow = useCallback(() => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // storage unavailable: hidden until the page reloads
    }
    listeners.forEach((cb) => cb());
    // The card goes with its button: focus to Today's heading, not the page (as OnThisDay).
    document.getElementById("today-title")?.focus();
  }, [key]);
  if (hidden || !toolboxCardShows(mood)) return null;

  return (
    <section aria-labelledby="toolbox-card-title" data-testid="toolbox-card" className="rounded-3xl border border-border bg-surface p-[20px]">
      <h2 id="toolbox-card-title" className="text-lg font-medium text-text">
        {t("cardTitle")}
      </h2>
      {items.length > 0 ? (
        <ul data-testid="toolbox-card-items" className="mt-3 list-disc space-y-1 ps-[20px] text-text [overflow-wrap:break-word]">
          {items.map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      ) : (
        <Link href="/app/me/toolbox" data-testid="toolbox-card-add" className="mt-3 inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4">
          {t("cardEmpty")}
        </Link>
      )}
      <div className="mt-4 flex flex-wrap gap-[12px]">
        <button type="button" data-testid="toolbox-card-breathe" onClick={() => setBreathing(true)} className={dialogButton(true)}>
          {t("breathe")}
        </button>
        <button type="button" data-testid="toolbox-card-not-now" onClick={notNow} className={dialogButton()}>
          {t("notNow")}
        </button>
      </div>
      {breathing && <Breathing onClose={() => setBreathing(false)} />}
    </section>
  );
}
