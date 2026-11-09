"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { GetHelpNow, SafetyCard } from "@/components/SafetyCard";
import { LETTER_RULES, type Letter, type LetterMonths } from "@/lib/journal/letters";
import { dateLine } from "@/lib/journal/today";
import { flagsCrisis } from "@/lib/safety/crisis";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { deleteLetter, openLetter, saveLetter, type LetterResult } from "./actions";

const MONTHS_KEY: Record<LetterMonths, "in1" | "in3" | "in6" | "in12"> = { 1: "in1", 3: "in3", 6: "in6", 12: "in12" };
const SECTION = "rounded-3xl border border-border bg-surface p-[24px] max-sm:px-[max(12px,calc(40px-1rem))]";

// Me → Letters to future me (1.2; content/letters.json). Write one and choose when it opens;
// a locked one shows only its dates (its text isn't even here until it's opened); open early
// with a confirm; delete with a confirm; no edit. The matcher runs on the text at saving and
// opens the help card on a match, as entries do. Nothing about that is stored.
export function LettersEditor({ initial, dateLocaleTag, country }: { initial: Letter[]; dateLocaleTag: string; country: string | null | undefined }) {
  const t = useTranslations("letters");
  const tt = useTranslations("today");
  const [letters, setLetters] = useState(initial);
  const [body, setBody] = useState("");
  const [months, setMonths] = useState<LetterMonths>(1);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [card, setCard] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "open" | "delete"; letter: Letter } | null>(null);
  // Letters opened here whose text the matcher matched: help above them (the Reviewer's read).
  // In this visit only; nothing about it is stored.
  const [helpFor, setHelpFor] = useState<Set<string>>(() => new Set());
  const date = (iso: string) => dateLine(iso, dateLocaleTag);

  const run = async <T,>(call: Promise<T>): Promise<T | null> => {
    setBusy(true);
    setFailed(false);
    const result = await call.catch(() => null);
    setBusy(false);
    return result;
  };
  const save = async () => {
    if (busy || body.trim() === "") return;
    // Before any request, as entries: the card needs no network (#190).
    if (flagsCrisis(body, CRISIS_KEYWORDS)) setCard(true);
    const before = new Set(letters.map((l) => l.id));
    const result: LetterResult | null = await run(saveLetter(body, months));
    if (result?.status !== "ok") return setFailed(true);
    setLetters(result.letters);
    const made = result.letters.find((l) => !before.has(l.id));
    setSaved(made ? made.opensOn : null);
    setBody("");
  };
  const open = async (letter: Letter) => {
    const result = await run(openLetter(letter.id));
    setConfirm(null);
    if (result?.status !== "ok") return setFailed(true);
    setLetters((list) => list.map((l) => (l.id === letter.id ? { ...l, body: result.body, opened: true } : l)));
    // Opened outside Today's card (which the server matched first): matched here, as at saving.
    if (flagsCrisis(result.body, CRISIS_KEYWORDS)) {
      setHelpFor((now) => new Set(now).add(letter.id));
      setCard(true);
    }
  };
  const remove = async (letter: Letter) => {
    const result = await run(deleteLetter(letter.id));
    setConfirm(null);
    if (result?.status !== "ok") return setFailed(true);
    setLetters(result.letters);
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="letter-new-title" className={SECTION}>
        <h2 id="letter-new-title" className="text-lg font-medium text-text max-sm:[font-size:min(1.125rem,max(11.25vw,36px))]">
          {t("editorTitle")}
        </h2>
        {letters.length === 0 && (
          <p data-testid="letters-empty" className="mt-1 text-muted">
            {t("empty")}
          </p>
        )}
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setSaved(null);
            }}
            placeholder={t("placeholder")}
            aria-label={t("editorTitle")}
            maxLength={LETTER_RULES.maxChars}
            rows={8}
            data-testid="letter-text"
            className="w-full min-w-0 rounded-2xl border border-border bg-surface p-[12px] text-text placeholder:text-muted"
          />
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
            <legend className="mb-1 font-medium text-text">{t("openLabel")}</legend>
            {(LETTER_RULES.monthChoices as LetterMonths[]).map((m) => (
              <label key={m} className="flex min-h-11 items-center gap-2 text-text">
                <input type="radio" name="letter-months" value={m} checked={months === m} onChange={() => setMonths(m)} data-testid={`letter-months-${m}`} />
                {t(MONTHS_KEY[m])}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" data-testid="letter-save" disabled={busy || body.trim() === ""} className={dialogButton(true)}>
              {t("save")}
            </button>
            <p role="status" data-testid="letter-saved" className="text-sm text-muted">
              {saved ? t("savedLine", { date: date(saved) }) : ""}
            </p>
          </div>
        </form>
      </section>

      {letters.length > 0 && (
        <ul data-testid="letters-list" className="space-y-3">
          {letters.map((letter) => (
            <li key={letter.id} data-testid="letter" data-locked={letter.opened ? undefined : ""} className="rounded-2xl border border-border bg-surface p-[16px]">
              {letter.opened ? (
                <>
                  {helpFor.has(letter.id) && (
                    <div className="mb-3">
                      <GetHelpNow country={country} testId="letter-open-help" neutral />
                    </div>
                  )}
                  <p className="font-medium text-text">{t("cardLine", { date: date(letter.writtenOn) })}</p>
                  <p data-testid="letter-body" className="mt-2 whitespace-pre-wrap text-text [overflow-wrap:break-word]">
                    {letter.body}
                  </p>
                </>
              ) : (
                <p className="font-medium text-text">{t("timelineLine", { date: date(letter.opensOn) })}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {!letter.opened && (
                  <button type="button" data-testid="letter-open" disabled={busy} onClick={() => setConfirm({ kind: "open", letter })} className={dialogButton()}>
                    {t("open")}
                  </button>
                )}
                <button type="button" data-testid="letter-delete" disabled={busy} onClick={() => setConfirm({ kind: "delete", letter })} className={dialogButton()}>
                  {t("delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {failed && (
        <p role="alert" data-testid="letters-failed" className="text-text">
          {tt("errGeneric")}
        </p>
      )}

      {confirm?.kind === "open" && (
        <Dialog title={t("earlyTitle")} body={t("earlyBody", { date: date(confirm.letter.opensOn) })} onCancel={() => setConfirm(null)} testId="letter-open-early">
          <button type="button" data-testid="letter-keep" onClick={() => setConfirm(null)} className={dialogButton(true)}>
            {t("keepForLater")}
          </button>
          <button type="button" data-testid="letter-open-now" disabled={busy} onClick={() => void open(confirm.letter)} className={dialogButton()}>
            {t("openNow")}
          </button>
        </Dialog>
      )}
      {confirm?.kind === "delete" && (
        <Dialog title={t("deleteTitle")} body={t("deleteBody")} onCancel={() => setConfirm(null)} testId="letter-delete-confirm">
          <button type="button" data-testid="letter-delete-keep" onClick={() => setConfirm(null)} className={dialogButton(true)}>
            {t("keep")}
          </button>
          <button type="button" data-testid="letter-delete-yes" disabled={busy} onClick={() => void remove(confirm.letter)} className={dialogButton()}>
            {t("delete")}
          </button>
        </Dialog>
      )}
      {card && <SafetyCard country={country} onClose={() => setCard(false)} />}
    </div>
  );
}
