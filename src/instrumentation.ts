import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./sentry.shared";
import { withoutServerSessions, withoutSessions } from "./lib/sentrySessions";

// Server-side Sentry (Node and Edge runtimes). Vercel provides
// NEXT_PUBLIC_SENTRY_DSN; SENTRY_DSN is the name used in local .env files.
// No release-health sessions on either runtime (see lib/sentrySessions.ts).
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Node only (the Edge bundle can't load @sentry/node): drop the session
    // integrations and rebuild Http without request sessions.
    const { httpIntegration } = await import("@sentry/node");
    Sentry.init({
      dsn,
      ...sentryOptions,
      integrations: (defaults) => withoutServerSessions(defaults, () => httpIntegration({ sessions: false })),
    });
  } else if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({ dsn, ...sentryOptions, integrations: withoutSessions });
  }
}

// Errors thrown while rendering server components, route handlers and
// server actions.
export const onRequestError = Sentry.captureRequestError;
