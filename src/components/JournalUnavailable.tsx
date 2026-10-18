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
export function JournalUnavailable() {
  const t = useTranslations("auth");
  const ta = useTranslations("app");
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center" data-testid="journal-unavailable">
      <p role="alert" className="text-lg font-medium text-text">
        {t("errGeneric")}
      </p>
      <button
        type="button"
        data-testid="try-again"
        disabled={retrying}
        onClick={() => startRetry(() => router.refresh())}
        className="mt-6 inline-flex min-h-12 items-center rounded-full border border-border px-6 font-medium text-accent hover:bg-pill disabled:opacity-60"
      >
        {ta("tryAgain")}
      </button>
      <div className="mt-4 min-h-6">
        <SlowLoading active={retrying} />
      </div>
    </main>
  );
}
