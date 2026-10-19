import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // The legal and Help pages read content/** with fs at build time; keep the
  // files in the server bundle too in case a page renders on demand.
  outputFileTracingIncludes: {
    "/[locale]/privacy": ["./content/legal/**"],
    "/[locale]/terms": ["./content/legal/**"],
    "/[locale]/help": ["./content/help/**"],
    "/[locale]/help/[slug]": ["./content/help/**"],
    "/sitemap.xml": ["./content/help/**"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          // strict-origin everywhere: every request (to us or anyone,
          // fonts, scripts, the visit counter's beacon) carries only the
          // bare origin as its referrer, never a page address. Ours can hold
          // single-use tokens (/auth/confirm?token_hash=, /email-confirmed
          // ?code=), entry ids, days and ?date= (decision 79 + reviewer,
          // #21: the counter reports document.referrer, which its
          // beforeSend never sees). Not no-referrer: then Chrome sends
          // "Origin: null" on a no-JS form POST and Next rejects the server
          // action (500).
          { key: "Referrer-Policy", value: "strict-origin" },
        ],
      },
      // Images linked from emails (public/email): the path never changes, since
      // sent emails keep pointing at it. 30 days of caching; a new logo would
      // replace the file in place.
      {
        source: "/email/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }],
      },
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
