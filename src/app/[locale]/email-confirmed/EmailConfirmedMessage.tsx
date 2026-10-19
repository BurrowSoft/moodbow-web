"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { classifyAuthLink, type AuthLinkResult } from "@/lib/authLink";
import { ContinueCountdown } from "./ContinueCountdown";

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

// continueTo: where Continue (and the countdown, decision 134) goes, or
// null while the web journal isn't live (the page stays as it is).
export function EmailConfirmedMessage({ fromQuery, continueTo }: { fromQuery: AuthLinkResult; continueTo: string | null }) {
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

  const moveOn = result === "ok" || result === "email_changed";
  const copy = COPY[result];
  return (
    <div data-testid={`email-confirmed-${result}`} className="flex flex-col items-center text-center">
      <h1 className="text-balance text-[28px] font-medium leading-tight tracking-tight sm:text-4xl">{t(copy.title)}</h1>
      {/* With the countdown, "Open Moodbow to continue." would contradict it:
          the web line instead (decision 134). */}
      <p className="mt-4 text-base leading-relaxed text-muted sm:text-[17px]">{result === "ok" && continueTo ? t("emailConfirmedWebBody") : t(copy.body)}</p>
      {moveOn && continueTo && <ContinueCountdown href={continueTo} />}
    </div>
  );
}
