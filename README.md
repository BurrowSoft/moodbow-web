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

## Deploy (Firebase Hosting)

Hosting is configured in `firebase.json` to serve `build/web`. Flutter isn't in the build
images of Firebase, Cloudflare Pages or Netlify, so we build locally and upload the output.

One-time setup:

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # pick or create the Firebase project, alias "default"
```

Each deploy:

```bash
flutter build web --release
firebase deploy --only hosting
```

### Domain

In the Firebase console → Hosting → **Add custom domain**:

1. Add `moodbow.com` and create the DNS records Firebase shows at the registrar.
2. Add `www.moodbow.com` and choose **Redirect to moodbow.com**.

The apex (`moodbow.com`) is canonical: `og:url` and `og:image` in `web/index.html` use it.
Firebase issues and renews HTTPS certificates for both automatically.

### Checking link previews

After deploying, paste `https://moodbow.com` into:
- https://developers.facebook.com/tools/debug/ (Open Graph, also used by WhatsApp)
- https://cards-dev.twitter.com/validator, or just a draft post on X
- a Slack message

WhatsApp and Slack cache previews, so use the debugger's "Scrape again" after changing the image.
