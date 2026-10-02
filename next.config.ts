import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Auth links carry single-use tokens in the query (overrides the rule
      // above; the last match wins). strict-origin: every request from these
      // pages (incl. their own fonts and scripts) sends only the bare origin,
      // never the URL with the token. Not no-referrer: then Chrome sends
      // "Origin: null" on a no-JS form POST and Next rejects the server
      // action (500).
      ...["/auth/:path*", "/:locale/auth/:path*", "/email-confirmed", "/:locale/email-confirmed"].map((source) => ({
        source,
        headers: [{ key: "Referrer-Policy", value: "strict-origin" }],
      })),
      // Deep-link verification files (public/.well-known). Android and Apple
      // only accept them as JSON, and the AASA file has no extension, so the
      // type is set explicitly. The proxy skips paths with a dot, so neither
      // is ever redirected to a locale.
      {
        source: "/.well-known/assetlinks.json",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
      {
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
};

// Sentry: source maps are uploaded at build time only when SENTRY_AUTH_TOKEN,
// SENTRY_ORG and SENTRY_PROJECT are set (Vercel env vars), then deleted from
// the deployment so they're never served. Local and CI builds skip the upload.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG?.trim(),
  project: process.env.SENTRY_PROJECT?.trim(),
  authToken: process.env.SENTRY_AUTH_TOKEN?.trim(),
  silent: !process.env.CI,
  // No build telemetry to Sentry: only runtime errors, scrubbed, are sent.
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
