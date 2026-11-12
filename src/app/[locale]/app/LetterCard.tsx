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
// The day's hide: "help" when the card was showing the help offer first (a matched letter or a
// hard week), else "1"; null when not hidden.
const HIDDEN = "1";
const HIDDEN_WITH_HELP = "help";
const hiddenFor = (key: string): string | null => {
  try {
    const value = window.localStorage.getItem(key);
    return value === HIDDEN || value === HIDDEN_WITH_HELP ? value : null;
  } catch {
    return null;
  }
};

export type TodayLetter = { id: string; writtenLabel: string; helpFirst: boolean };

// Rendered whenever letters are on, with or without a letter due: after Not now a reload may have
// no letter left to offer, and a hide that had help first still owes the help line (UX 12 Nov,
// the Reviewer's finding: Today has no standing Get help now). So Not now on a help-first card
// leaves the help offer alone on Today for the rest of that day, on this device, reload or not.
export function LetterCard({ letter, uid, today, country }: { letter: TodayLetter | null; uid: string; today: string; country: string | null | undefined }) {
  const key = localKey("letter-card-hidden", uid, today);
  const hidden = useSyncExternalStore(subscribe, () => hiddenFor(key), () => null);
  // Not now this visit, when storage can't keep it: the same, until the page reloads.
  const [gone, setGone] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const hide = gone ?? hidden;
  // Hidden for today, unless this letter is open here (it was opened before Not now could hide it).
  if (hide !== null && !opened) return hide === HIDDEN_WITH_HELP ? <GetHelpNow country={country} testId="letter-help" neutral /> : null;
  if (!letter) return null;
  return <DueLetter letter={letter} storageKey={key} country={country} onOpened={() => setOpened(true)} onNotNow={setGone} />;
}

function DueLetter({ letter, storageKey, country, onOpened, onNotNow }: { letter: TodayLetter; storageKey: string; country: string | null | undefined; onOpened: () => void; onNotNow: (value: string) => void }) {
  const { id, writtenLabel, helpFirst } = letter;
  const t = useTranslations("letters");
  const tt = useTranslations("today");
  const [body, setBody] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = async () => {
    setBusy(true);
    setFailed(false);
    const result = await openLetter(id).catch(() => ({ status: "error" as const }));
    setBusy(false);
    if (result.status === "ok") {
      setBody(result.body);
      onOpened();
      // Opened, the letter isn't due any more, so the next load of Today has no card to put the
      // help offer above: keep the help line alone for the rest of the day (UX 12 Nov, as the
      // app's letters/app 71eef38). This visit still shows the opened letter (onOpened).
      if (helpFirst) {
        try {
          window.localStorage.setItem(storageKey, HIDDEN_WITH_HELP);
        } catch {
          // storage unavailable: the help shows with the letter until the page reloads
        }
        listeners.forEach((cb) => cb());
      }
    } else setFailed(true);
  };
  const notNow = async () => {
    setBusy(true);
    setFailed(false);
    const result = await letterNotNow(id).catch(() => ({ status: "error" as const }));
    setBusy(false);
    if (result.status !== "ok") return setFailed(true);
    const value = helpFirst ? HIDDEN_WITH_HELP : HIDDEN;
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // storage unavailable: gone until the page reloads
    }
    listeners.forEach((cb) => cb());
    onNotNow(value);
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
