# moodbow-web

The "coming soon" page for [moodbow.com](https://moodbow.com), built with Flutter Web.
A BurrowSoft product.

## Requirements

- Flutter (stable channel). Check with `flutter --version`.
- Chrome, for local runs.

## Run locally

```bash
flutter pub get
flutter run -d chrome
```

To preview the production build:

```bash
flutter build web --release
npx serve build/web     # or: python -m http.server -d build/web 8080
```

## Checks

```bash
flutter analyze
flutter test
```

## Project layout

```text
lib/
  main.dart               MaterialApp, light/dark themes (ThemeMode.system)
  theme.dart              brand colors, text styles, light/dark palettes
  coming_soon_page.dart   the page
assets/
  brand/                  stacked logos (from the Moodbow brand kit)
  fonts/                  Poppins Regular + Medium (SIL OFL, see OFL.txt)
web/
  index.html              SEO/Open Graph tags, HTML splash, <noscript> fallback
  og-image.png            1200×630 link-preview image
  favicon.*, apple-touch-icon.png, icons/, manifest.json
```

`web/index.html` carries everything search engines and link previews need, because
Flutter renders to a canvas. It also shows a small HTML splash (the Moodbow mark on the
brand background) until Flutter fires `flutter-first-frame`, so the page is never blank
while loading. If you change the headline or description, update `index.html` (title,
meta description, Open Graph tags, `<noscript>`) too.

## Deploy (Vercel)

The Vercel project is connected to this GitHub repo, so every push to `main` deploys to
production and every other branch gets a preview URL.

Vercel's build image has no Flutter, so `vercel.json` handles it:

- **Install:** clones the Flutter SDK (pinned to the stable tag in `vercel.json`) into
  `./flutter`, which is git-ignored, then runs `flutter pub get`.
- **Build:** `flutter build web --release`.
- **Output:** `build/web`.

Vercel caches `./flutter` between builds, so only the first build pays for the SDK download.
To upgrade Flutter, change the tag in `installCommand` and redeploy with
"Redeploy → without build cache" so the new SDK is fetched.

Leave the Framework Preset as "Other" and the build settings on their defaults in the Vercel
dashboard; `vercel.json` overrides them.

### Domain

In Vercel → Project → Settings → Domains:

1. Add `moodbow.com` and set it as the primary domain.
2. Add `www.moodbow.com` and choose to redirect it to `moodbow.com` (308).
3. Create the DNS records Vercel shows at the registrar.

The apex (`moodbow.com`) is canonical: `og:url` and `og:image` in `web/index.html` use it.
Vercel issues and renews HTTPS certificates automatically.

### Checking link previews

After deploying, paste `https://moodbow.com` into:
- https://developers.facebook.com/tools/debug/ (Open Graph, also used by WhatsApp)
- https://cards-dev.twitter.com/validator, or just a draft post on X
- a Slack message

WhatsApp and Slack cache previews, so use the debugger's "Scrape again" after changing the image.
