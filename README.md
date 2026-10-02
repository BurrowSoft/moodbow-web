# moodbow-web

The website for [www.moodbow.com](https://www.moodbow.com): marketing, legal, account deletion,
support, and (soon) the signed-in web journal. Next.js (App Router) + next-intl, deployed on Vercel.
A BurrowSoft product.

## Requirements

- Node.js 20.9 or newer (CI uses 24).

## Run locally

```bash
npm install
npm run dev            # http://localhost:3000
```

No env vars are needed locally. See `.env.example` for the names Vercel uses.

## Checks (all run in CI on every PR)

```bash
npm run typecheck      # next typegen && tsc --noEmit
npm run lint
npm test               # vitest: message parity, conditions, Sentry scrubber, helpers
npm run build
npm run test:e2e       # Playwright smoke against `npm run start` (build first)
```

Run the smoke tests against a Vercel Preview with
`E2E_BASE_URL=https://<preview-url> npm run test:e2e`. When Deployment Protection is on, also set
`VERCEL_AUTOMATION_BYPASS_SECRET` in your shell; never commit it.

## Languages

English at `/`, Thai at `/th` (`src/i18n/routing.ts`). Every string lives in `src/messages/<locale>.json`,
and every key must exist in every file. `src/messages/messages.test.ts` checks keys, ICU syntax and
placeholders. To add a language, add it to `routing.locales` and add its message file.
A Thai browser is sent to `/th` on its first visit. The footer's language switcher remembers the choice
in the `NEXT_LOCALE` cookie.

Fonts: Poppins (Latin) with Prompt for Thai glyphs, self-hosted by `next/font`.

## Pages

| Path | What | Gate |
|---|---|---|
| `/` | Coming soon + 3 feature blocks + "Get notified" (mailto) | — |
| `/support` | Support email | — |
| `/privacy`, `/terms` | Skeletons until the final text (W3) | `privacy-text-approved`, `terms-text-approved` |
| `/account-deletion` | Google Play's account-deletion URL | `delete-account-live` (+ `backup-retention-confirmed` for the backups line) |
| `/email-confirmed` | Where Supabase confirm links land; strips tokens from the URL; noindex | — |
| `/.well-known/assetlinks.json` | Android App Links (empty until the app's signing fingerprints exist) | — |
| `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` | Generated from `src/app/*.ts` | — |

### Text = enforcement: conditions and flags

- `content/conditions.json`: "is it true yet?" facts, read through `conditionMet(id)`.
  A page gated on an unmet condition is a **404 on Production**, and a **draft** (banner + noindex) on
  Previews, locally and in CI, so it can be reviewed (`pageGate` in `src/lib/conditions.ts`). Gated pages
  are linked from the footer and listed in the sitemap only once their condition is met.
- `src/lib/liveFeatures.ts`: what public pages may claim or link to (e.g. `webJournal`).

Flipping either is its own small reviewed PR, after the feature is live, with the owner's go where needed.
The unit tests pin the current values.

## Sentry

`src/instrumentation*.ts` + `src/sentry.shared.ts`. Off without `NEXT_PUBLIC_SENTRY_DSN`. When on, the
SDK collects no personal data (`dataCollection` all off, no replay, no tracing), and every event and
breadcrumb passes through `src/lib/sentryScrub.ts`: URLs are cut to their path (no query or fragment),
emails, phones and Thai IDs are redacted, and console and input breadcrumbs are dropped. Nothing a user
types may reach Sentry.

## Deploy (Vercel)

The Vercel project is connected to this repo: `main` deploys to Production, and every other branch gets
a Preview. `vercel.json` sets the framework to Next.js; the dashboard's build settings stay on their
defaults.

Canonical host: **www.moodbow.com**. `moodbow.com` redirects to it (308, Vercel → Domains), and canonical
URLs, Open Graph tags and the sitemap use www (`SITE_URL` in `src/lib/site.ts`).

### Checking link previews

After deploying, paste `https://www.moodbow.com` into https://developers.facebook.com/tools/debug/
(Open Graph, also used by WhatsApp), a draft post on X, or a Slack message. WhatsApp and Slack cache
previews; use the debugger's "Scrape again" after changing the image.
