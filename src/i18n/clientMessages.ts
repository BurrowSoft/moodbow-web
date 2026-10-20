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
