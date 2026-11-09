"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { GetHelpNow } from "@/components/SafetyCard";
import { JOURNAL_CARD } from "@/lib/ui/journalLayout";
import { letterNotNow, openLetter } from "./me/letters/actions";

// A letter from you, on its day (1.2; content/letters.json). Only the date it was written
// until Open: the text isn't in the page before then, only fetched by Open. helpFirst: the
// server matched the text, or last week looked hard, so the help offer comes above it (the
// Reviewer's read); this card is given a yes or no, never the text. Not now: a week on.
export function LetterCard({ id, writtenLabel, helpFirst, country }: { id: string; writtenLabel: string; helpFirst: boolean; country: string | null | undefined }) {
  const t = useTranslations("letters");
  const tt = useTranslations("today");
  const [body, setBody] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (gone) return null;

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
