"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { classifyAuthLink, type AuthLinkResult } from "@/lib/authLink";

// Read once, before the effect below cleans the URL, so the result stays
// stable for the life of the page.
let firstResult: AuthLinkResult | null = null;
function readResult(): AuthLinkResult {
  firstResult ??= classifyAuthLink(window.location.search, window.location.hash);
  return firstResult;
}
const subscribe = () => () => {};

const COPY = {
  ok: { title: "successTitle", body: "successBody" },
  error: { title: "errorTitle", body: "errorBody" },
  email_changed: { title: "emailChangedTitle", body: "emailChangedBody" },
  email_change_pending: { title: "emailChangePendingTitle", body: "emailChangePendingBody" },
} as const satisfies Record<AuthLinkResult, { title: string; body: string }>;
const serverResult = () => null;

export function EmailConfirmedMessage({ showContinue }: { showContinue: boolean }) {
  const t = useTranslations("emailConfirmed");
  const result = useSyncExternalStore(subscribe, readResult, serverResult);

  // Confirmation links can carry tokens in the query or fragment: drop them
  // from the address bar and history so they aren't shared, bookmarked or
  // sent on in a referrer.
  useEffect(() => {
    if (window.location.search || window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, []);

  // Before hydration the result isn't known; keep the space so nothing jumps.
  if (result === null) return <div className="min-h-32" aria-hidden="true" />;

  const ok = result === "ok";
  const copy = COPY[result];
  return (
    <div data-testid={`email-confirmed-${result}`} className="flex flex-col items-center text-center">
      <h1 className="text-balance text-[28px] font-medium leading-tight tracking-tight sm:text-4xl">{t(copy.title)}</h1>
      <p className="mt-4 text-base leading-relaxed text-muted sm:text-[17px]">{t(copy.body)}</p>
      {ok && showContinue && (
        <Link
          href="/app"
          className="mt-9 inline-flex min-h-[52px] min-w-[200px] items-center justify-center rounded-full bg-accent px-8 py-3.5 text-base font-medium text-on-accent hover:opacity-90"
        >
          {t("continueWeb")}
        </Link>
      )}
    </div>
  );
}
