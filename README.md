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
NEXT_PUBLIC_SHOW_DRAFTS=1 npm run build   # a test build: gated pages render as drafts
npm run test:e2e       # Playwright smoke against `npm run start` (build first)
```

Run the smoke tests against a Vercel Preview with
`E2E_BASE_URL=https://<preview-url> npm run test:e2e`. When Deployment Protection is on, also set
`VERCEL_AUTOMATION_BYPASS_SECRET` in your shell; never commit it.

## Languages and text

The beta ships in **English only**, at `/`. **No hard-coded user-facing text:** every visible string,
alt text, aria label, title and placeholder, plus metadata, Open Graph tags and the manifest, comes from
`src/messages/en.json` through next-intl. `npm run lint` fails on literal JSX text and on literal
user-facing attributes (`eslint.config.mjs`). Long-form bodies (legal, help) sit inside an element
with `data-content="article"`.

Adding languages (th, es, pt-BR, fr, de) is planned as one localization PR: add each to
`routing.locales` (`src/i18n/routing.ts`) and add `src/messages/<locale>.json` with every key
(`src/messages/messages.test.ts` checks key, ICU and placeholder parity). Non-English locales get a
`/<locale>` prefix, and the footer's language switcher appears once there are two or more.

Fonts: Poppins (Latin), with Prompt ready for Thai glyphs (not preloaded), self-hosted by `next/font`.

## Pages

| Path | What | Gate |
|---|---|---|
| `/` | Coming soon + 3 feature blocks + "Get notified" (mailto) | — |
| `/support` | Support email | — |
| `/privacy`, `/terms` | Skeletons until the final text (W3) | `privacy-text-approved`, `terms-text-approved` |
| `/account-deletion` | Google Play's account-deletion URL | `delete-account-live` (+ `backup-retention-confirmed` for the backups line) |
| `/email-confirmed` | Where Supabase confirm links land; strips tokens from the URL; noindex | — |
| `/.well-known/assetlinks.json` | Android App Links (empty until the app's signing fingerprints exist) | — |
| `/.well-known/apple-app-site-association` | iOS Universal Links (no claims until the iOS app, R2); served as JSON | — |
| `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` | Generated from `src/app/*.ts` | — |

### Auth email links

The Supabase send-email hook (moodbow-app) links to `/auth/confirm?token_hash=…&type=…`. **GET only shows a page
with one button** and never calls Supabase, so mail scanners that prefetch links can't spend the single-use
token. The click (a server action) runs `verifyOtp` against the deployment's own project (Production → prod,
Preview → staging; env `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) and redirects to a
clean URL:

- signup and similar → `/email-confirmed`;
- recovery → `/auth/reset-password` (sets the password, signs the account out on every device, then shows
  `?status=changed`);
- email change → `/email-confirmed?result=email_changed`, or `email_change_pending` after the first of the two
  confirmations;
- anything else → `/email-confirmed?result=expired`.

`redirect_to` is never followed, the pages send `Referrer-Policy: same-origin` (never to other sites; `no-referrer` broke the no-JS form POST) and noindex, and nothing logs the token. Without
the env vars every link fails closed.

### Text = enforcement: conditions and flags

- `content/conditions.json`: "is it true yet?" facts, read through `conditionMet(id)`.
  A page gated on an unmet condition is a **404** unless the build is explicitly a test build (Vercel
  Preview, `next dev`, or `NEXT_PUBLIC_SHOW_DRAFTS=1` as in CI), where it is a **draft** (banner + noindex)
  so it can be reviewed. It fails closed: an unset environment hides it (`pageGate` in `src/lib/conditions.ts`). Gated pages
  are linked from the footer and listed in the sitemap only once their condition is met.
- `src/lib/liveFeatures.ts`: what public pages may claim or link to (e.g. `webJournal`).

Flipping either is its own small reviewed PR, after the feature is live, with the owner's go where needed.
The unit tests pin the current values.

## Sentry

`src/instrumentation*.ts` + `src/sentry.shared.ts`. Off without `NEXT_PUBLIC_SENTRY_DSN`. When on, the
SDK collects no personal data (`dataCollection` all off, no replay, no tracing), and every event and
breadcrumb passes through `src/lib/sentryScrub.ts`. All free text is dropped: messages, exception values,
source lines, breadcrumb messages, log entries, and free-form tags. The user is dropped, including the internal
id, and URLs are cut to their path. What stays is structure (exception type, stack, route, browser/OS, release).
The privacy policy promises this ("we remove any text you've written"), so keep it that way.
No release-health sessions (their envelopes carry the user id and bypass `beforeSend`): every runtime drops
the integrations named *Session* (BrowserSession, ProcessSession), and Node also rebuilds Http with
`sessions: false` (`src/lib/sentrySessions.ts`; real-SDK tests for browser and Node).
Lint bans `Sentry.setUser/setTag/setContext/setExtra` everywhere in `src`; `src/lint.test.ts` pins the rules.

## Deploy (Vercel)

The Vercel project is connected to this repo: `master` deploys to Production, and every other branch gets
a Preview. `vercel.json` sets the framework and the install/build/output commands, which take precedence
over the dashboard's build settings.

Canonical host: **www.moodbow.com**. `moodbow.com` redirects to it (308, Vercel → Domains), and canonical
URLs, Open Graph tags and the sitemap use www (`SITE_URL` in `src/lib/site.ts`).

### Checking link previews

After deploying, paste `https://www.moodbow.com` into https://developers.facebook.com/tools/debug/
(Open Graph, also used by WhatsApp), a draft post on X, or a Slack message. WhatsApp and Slack cache
previews; use the debugger's "Scrape again" after changing the image.
