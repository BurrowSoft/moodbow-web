import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./sentry.shared";

// Server-side Sentry (Node and Edge runtimes). Vercel provides
// NEXT_PUBLIC_SENTRY_DSN; SENTRY_DSN is the name used in local .env files.
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({ dsn, ...sentryOptions });
  }
}

// Errors thrown while rendering server components, route handlers and
// server actions.
export const onRequestError = Sentry.captureRequestError;
