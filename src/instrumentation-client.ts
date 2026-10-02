import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./sentry.shared";

// Browser-side Sentry. The DSN is public by design (it only allows sending
// events). Unset locally and in CI, so nothing is sent from there.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) Sentry.init({ dsn, ...sentryOptions });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
