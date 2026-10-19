"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlowLoading } from "./SlowLoading";

// Shown when a signed-in person's journal data can't be loaded (get_me
// failed, or Supabase Auth didn't answer within 10 s: an outage). Not a
// redirect: sending them to sign-in would loop straight back here, since
// the session itself is fine. Try again reloads the page's data in place
// and says "Taking longer than usual…" if that takes over 3 s.
// standalone: it's the whole page (the /app layout itself, Set up), so it
// is the page's <main id="main">. Inside a page of the journal it's a
// section of the layout's <main>: one main landmark, one #main (the skip
// link's target; Web Tester's a11y note).
export function JournalUnavailable({ standalone = false }: { standalone?: boolean }) {
  const t = useTranslations("auth");
  const ta = useTranslations("app");
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const Root = standalone ? "main" : "section";
  return (
    <Root
      id={standalone ? "main" : undefined}
      className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center"
      data-testid="journal-unavailable"
    >
      {/* The page's heading too: when the journal can't load, this is all
          the page has (a11y pass). */}
      <div role="alert">
        <h1 className="text-lg font-medium text-text">{t("errGeneric")}</h1>
      </div>
      <button
        type="button"
        data-testid="try-again"
        // Focusable while it retries (disabling it dropped focus).
        aria-disabled={retrying}
        onClick={() => !retrying && startRetry(() => router.refresh())}
        className="mt-6 inline-flex min-h-12 items-center rounded-full border border-border px-6 font-medium text-accent hover:bg-pill aria-disabled:opacity-60"
      >
        {ta("tryAgain")}
      </button>
      <div className="mt-4 min-h-6">
        <SlowLoading active={retrying} />
      </div>
    </Root>
  );
}
