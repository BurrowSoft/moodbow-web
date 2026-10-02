"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

// Shown when a signed-in person's journal data can't be loaded (get_me
// failed: an outage, a timeout). Not a redirect: sending them to sign-in
// would loop straight back here, since the session itself is fine.
export function JournalUnavailable() {
  const t = useTranslations("auth");
  const ta = useTranslations("app");
  const router = useRouter();
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center" data-testid="journal-unavailable">
      <p role="alert" className="text-lg font-medium text-text">
        {t("errGeneric")}
      </p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-6 inline-flex min-h-12 items-center rounded-full border border-border px-6 font-medium text-accent hover:bg-pill"
      >
        {ta("retry")}
      </button>
    </main>
  );
}
