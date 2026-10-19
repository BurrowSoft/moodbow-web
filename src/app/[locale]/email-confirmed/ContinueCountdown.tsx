"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { STATUS_BUTTON } from "@/components/statusButton";

export const COUNTDOWN_SECONDS = 5;

// After a confirmed email (decision 134, while the web journal is live):
// on to `href` after 5 s, unless the person moves on sooner (Continue) or
// stops it (Stay on this page; WCAG 2.2.1 Timing Adjustable). The sentence
// is announced once, when it appears; the ticking number is visual only
// (aria-hidden), so a screen reader isn't told every second. No animation.
export function ContinueCountdown({ href }: { href: string }) {
  const t = useTranslations("emailConfirmed");
  const router = useRouter();
  const [left, setLeft] = useState(COUNTDOWN_SECONDS);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    if (stopped) return;
    if (left <= 0) {
      router.push(href);
      return;
    }
    const timer = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left, stopped, href, router]);

  return (
    <div className="mt-9 flex w-full flex-col items-center gap-4" data-testid="email-confirmed-countdown">
      {!stopped && (
        <>
          {/* Read once (its text never changes); the number shown changes. */}
          <p role="status" className="sr-only">
            {t("emailConfirmedRedirect", { seconds: COUNTDOWN_SECONDS })}
          </p>
          <p aria-hidden="true" data-testid="email-confirmed-seconds" className="text-sm text-muted">
            {t("emailConfirmedRedirect", { seconds: left })}
          </p>
        </>
      )}
      <Link href={href} data-testid="email-confirmed-continue" className={STATUS_BUTTON}>
        {t("emailConfirmedContinue")}
      </Link>
      {!stopped && (
        <button type="button" data-testid="email-confirmed-stay" onClick={() => setStopped(true)} className="min-h-11 text-sm font-medium text-accent underline underline-offset-4">
          {t("emailConfirmedStay")}
        </button>
      )}
    </div>
  );
}
