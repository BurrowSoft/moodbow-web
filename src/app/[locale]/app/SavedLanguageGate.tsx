"use client";

import { useEffect, useState, type ReactNode } from "react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { GetHelpNow } from "@/components/SafetyCard";
import { SignedInMark } from "@/components/SignedInMark";
import { goToLanguage, mayMoveTo } from "@/lib/savedLanguage";
import type { SavedLanguageCopy } from "@/lib/savedLanguageCopy";
import { saveRegion } from "./me/actions";

// How long the move may take before the page shows in this address's language instead.
export const MOVE_WAIT_MS = 3000;

// The journal in the person's saved language (row RT4): the /app layout found theirs differs from this address's, so
// this tries one full load to the same page in it (lib/savedLanguage.ts says why a full load). Until it goes, nobody is
// left on a bare link (#401, UX 20 Nov): Get help is there at once, and it says why in their language, with a way to
// stay in this one. If it hasn't gone after 3 s, or it can't (it tried moments ago and came back: the cookie didn't
// stick, #179), the page itself shows in this address's language, with a small notice offering theirs; the tabs and
// help work as always. The page isn't mounted while the move is pending, so nothing on it (a note marked seen, a
// once-a-night mark) happens for a page the person never saw.
// standalone: a page outside the journal (Consent, reset password), so no layout's main around it. While moving it
// brings its own (the skip link's target) and the signed-in mark the page would have, so the footer's language
// switcher steps aside as on the page itself. helpMessages: the help card's words (helpCardMessages), for a page the
// root layout doesn't send them to; only its Get help gets them, so the page keeps its own.
export function SavedLanguageGate({
  target,
  here,
  copy,
  country,
  standalone = false,
  helpMessages,
  children,
}: {
  target: string;
  here: string;
  copy: SavedLanguageCopy;
  country: string | null | undefined;
  standalone?: boolean;
  helpMessages?: AbstractIntlMessages;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const router = useRouter();
  const [mode, setMode] = useState<"moving" | "notice" | "closed">("moving");
  const [staying, setStaying] = useState(false);
  useEffect(() => {
    const moves = mayMoveTo(target);
    if (moves) goToLanguage(target, `${pathname}${window.location.search}`);
    // The page in this language: at once when the guard holds, else if the move hasn't gone after the wait.
    const timer = window.setTimeout(() => setMode((m) => (m === "moving" ? "notice" : m)), moves ? MOVE_WAIT_MS : 0);
    return () => window.clearTimeout(timer);
  }, [target, pathname]);
  // A plain link, a full page load, always with the language in the address (/en/app too): the proxy then sets the
  // cookie itself, which a script couldn't, and an unprefixed /app would be sent straight back.
  const href = `/${target}${pathname}${query ? `?${query}` : ""}`;
  // Stay: this language becomes theirs (Me's own save), so the next page doesn't ask again. The move may be on its
  // way: stop it first.
  const stayHere = async () => {
    if (staying) return;
    setStaying(true);
    try {
      window.stop();
    } catch {
      // nothing was loading
    }
    const { ok } = await saveRegion("locale", here).catch(() => ({ ok: false }));
    setStaying(false);
    setMode(ok ? "closed" : "notice");
    if (ok) router.refresh();
  };
  const moving = (
    <section data-testid="saved-language-redirect" className="flex min-h-[50dvh] flex-col items-center justify-center gap-[16px] text-center">
          {/* Help first, at once, in this page's language (decision 135). */}
          {helpMessages ? (
            <NextIntlClientProvider locale={here} messages={helpMessages}>
              <GetHelpNow country={country} testId="saved-language-help" neutral counted />
            </NextIntlClientProvider>
          ) : (
            <GetHelpNow country={country} testId="saved-language-help" neutral counted />
          )}
          {/* Held back for 2 s, so a move that goes at once doesn't flash it (CSS, so it shows without JavaScript). */}
          <p lang={copy.lang} data-after-wait className="text-text">
            {copy.setTo}{" "}
            <a href={href} data-testid="saved-language-link" className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4">
              {copy.continueIn}
            </a>
          </p>
          <button type="button" data-after-wait data-testid="saved-language-stay" onClick={() => void stayHere()} className="inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4">
            {copy.stay}
          </button>
        </section>
  );
  return (
    <>
      {mode === "moving" &&
        (standalone ? (
          <main id="main" className="flex min-h-dvh flex-col justify-center px-[16px]">
            <SignedInMark />
            {moving}
          </main>
        ) : (
          moving
        ))}
      {mode === "notice" && (
        <div role="status" data-testid="saved-language-notice" className="mb-[16px] flex items-start gap-[12px] rounded-2xl border border-border bg-surface p-[12px] text-sm text-text">
          <p lang={copy.lang} className="min-w-0 flex-1 self-center">
            {copy.setTo}{" "}
            <a href={href} data-testid="saved-language-switch" className="font-medium text-accent underline underline-offset-4">
              {copy.switchTo}
            </a>
          </p>
          <button type="button" aria-label={copy.close} title={copy.close} data-testid="saved-language-close" onClick={() => setMode("closed")} className="-m-[4px] inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-lg text-muted">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      )}
      {mode !== "moving" && children}
    </>
  );
}
