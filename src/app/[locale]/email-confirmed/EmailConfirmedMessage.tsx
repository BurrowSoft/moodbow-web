"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { classifyAuthLink, type AuthLinkResult } from "@/lib/authLink";

// The query (?result=… from /auth/confirm, Supabase's ?error=…) is read on
// the server and passed in as `fromQuery`: window.location can still show
// the previous URL during a client navigation (e.g. right after the
// confirm button's redirect). Only the fragment needs the browser: Supabase's
// own links put #error=… there, and they always arrive as a full page load.
// It's read once, before the effect below cleans the URL.
let hashResult: AuthLinkResult | undefined;
function readHash(): AuthLinkResult {
  hashResult ??= classifyAuthLink("", window.location.hash);
  return hashResult;
}
const subscribe = () => () => {};
const noHashOnServer = (): AuthLinkResult => "ok";

const COPY = {
  ok: { title: "successTitle", body: "successBody" },
  error: { title: "errorTitle", body: "errorBody" },
  email_changed: { title: "emailChangedTitle", body: "emailChangedBody" },
  email_change_pending: { title: "emailChangePendingTitle", body: "emailChangePendingBody" },
} as const satisfies Record<AuthLinkResult, { title: string; body: string }>;

export function EmailConfirmedMessage({ fromQuery, showContinue }: { fromQuery: AuthLinkResult; showContinue: boolean }) {
  const t = useTranslations("emailConfirmed");
  const fromHash = useSyncExternalStore(subscribe, readHash, noHashOnServer);
  const result: AuthLinkResult = fromHash === "error" ? "error" : fromQuery;

  // Confirmation links can carry tokens in the query or fragment: drop them
  // from the address bar and history so they aren't shared, bookmarked or
  // sent on in a referrer.
  useEffect(() => {
    if (window.location.search || window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, []);

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
