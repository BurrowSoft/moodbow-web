import type { AbstractIntlMessages } from "next-intl";

// The message namespaces client components read outside the journal (perf
// fix 3): the root layout sends only these to the browser; the journal's
// layout (/app) sends everything. Server components read their messages on
// the server, so their namespaces never need to travel. clientMessages.test.ts
// fails if a client component outside /app uses a namespace not listed here.
export const PUBLIC_CLIENT_NAMESPACES = ["ai", "app", "auth", "common", "emailConfirmed", "onboarding", "resetPassword"] as const;

export function pickMessages(messages: AbstractIntlMessages, namespaces: readonly string[]): AbstractIntlMessages {
  return Object.fromEntries(namespaces.filter((ns) => ns in messages).map((ns) => [ns, messages[ns]]));
}

// The help button and its card on public pages (GetHelpNow + SafetyCard in a
// scoped provider: Welcome, Create account, consent, the signed-out account
// pages): `safety` and `common`, plus the one `me` string the button uses,
// not all of `me` (the Reviewer's LOW, about 5 KB off each of those pages).
// clientMessages.test renders the button and its card with only these.
export const HELP_CARD_ME_KEYS = ["meGetHelpNow"] as const;

export function helpCardMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  const me = messages.me as Record<string, unknown> | undefined;
  return {
    ...pickMessages(messages, ["safety", "common"]),
    ...(me ? { me: Object.fromEntries(HELP_CARD_ME_KEYS.filter((k) => k in me).map((k) => [k, me[k]])) as AbstractIntlMessages } : {}),
  };
}
