import type { BrowserOptions } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "@/lib/sentryScrub";

// Options shared by the browser, Node and Edge Sentry clients. Privacy comes
// from what's sent: the SDK collects no personal data (every dataCollection
// category off), no Session Replay, no tracing, and every event and
// breadcrumb still goes through the scrubber (src/lib/sentryScrub.ts) as a
// second line of defence. Without a DSN (local dev, CI, until Vitor sets
// one), Sentry stays off.
export const sentryOptions = {
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
  },
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "development",
  // No performance tracing: spans carry full URLs. Errors only.
  tracesSampleRate: 0,
  beforeSend: (event) => scrubEvent(event),
  beforeSendTransaction: (event) => scrubEvent(event),
  beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
} satisfies Partial<BrowserOptions>;
