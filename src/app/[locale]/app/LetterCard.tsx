"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { localKey } from "@/lib/localData";
import { GetHelpNow } from "@/components/SafetyCard";
import { JOURNAL_CARD } from "@/lib/ui/journalLayout";
import { letterNotNow, openLetter } from "./me/letters/actions";

// A letter from you, on its day (1.2; content/letters.json). Only the date it was written
// until Open: the text isn't in the page before then, only fetched by Open. helpFirst: the
// server matched the text, or last week looked hard, so the help offer comes above it (the
// Reviewer's read); this card is given a yes or no, never the text. Not now: that letter a week
// on (the server), and no letter card again today on this device (UX 12 Nov, as the app and the
// toolbox card): one offer a day, not one letter after another. Stored per user and day, removed
// on sign-out (SIGN_OUT_TRACE_KINDS).
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
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

export function LetterCard({ id, uid, today, writtenLabel, helpFirst, country }: { id: string; uid: string; today: string; writtenLabel: string; helpFirst: boolean; country: string | null | undefined }) {
  const t = useTranslations("letters");
  const tt = useTranslations("today");
  const key = localKey("letter-card-hidden", uid, today);
  const hiddenToday = useSyncExternalStore(subscribe, () => hiddenFor(key), () => false);
  const [body, setBody] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Hidden for today, unless this letter is open here (it was opened before Not now could hide it).
  if (gone || (hiddenToday && body === null)) return null;

  const open = async () => {
    setBusy(true);
    setFailed(false);
    const result = await openLetter(id).catch(() => ({ status: "error" as const }));
    setBusy(false);
    if (result.status === "ok") setBody(result.body);
    else setFailed(true);
  };
  const notNow = async () => {
    setBusy(true);
    setFailed(false);
    const result = await letterNotNow(id).catch(() => ({ status: "error" as const }));
    setBusy(false);
    if (result.status !== "ok") return setFailed(true);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // storage unavailable: gone until the page reloads
    }
    listeners.forEach((cb) => cb());
    setGone(true);
    // The card goes with its button: focus to Today's heading, as other cards do.
    document.getElementById("today-title")?.focus();
  };

  return (
    <div className="space-y-3">
      {helpFirst && <GetHelpNow country={country} testId="letter-help" neutral />}
      <section aria-labelledby="letter-card-title" data-testid="letter-card" className={JOURNAL_CARD}>
        <h2 id="letter-card-title" className="text-lg font-medium text-text">
          {t("cardLine", { date: writtenLabel })}
        </h2>
        {body !== null ? (
          <p data-testid="letter-card-body" className="mt-3 whitespace-pre-wrap text-text [overflow-wrap:break-word]">
            {body}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-[12px]">
            <button type="button" data-testid="letter-card-open" disabled={busy} onClick={() => void open()} className={dialogButton(true)}>
              {t("open")}
            </button>
            <button type="button" data-testid="letter-card-not-now" disabled={busy} onClick={() => void notNow()} className={dialogButton()}>
              {t("notNow")}
            </button>
          </div>
        )}
        {failed && (
          <p role="alert" data-testid="letter-card-failed" className="mt-2 text-sm text-text">
            {tt("errGeneric")}
          </p>
        )}
      </section>
    </div>
  );
}
