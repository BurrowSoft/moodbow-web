# Prerendering the public pages under our CSP: spike write-up (stopped)

**Status:** stopped on 2026-10-21 by UX & PM. Nothing was built or measured. Revisit this before any paid ad push (next-release.md, "before any paid ad push"), and check first whether Next.js has shipped its own static-CSP support.

**Goal:** serve the public pages (`/`, `/support`, `/help/*`, and the legal pages once they're live) as prerendered static HTML from the CDN, instead of rendering each request. The CSP must stay as strict as today (reviewer's audit A1, `csp-enforced`): no `'unsafe-inline'` scripts.

## Why every page is dynamic today

- `src/lib/csp.ts` builds a `script-src` with a **per-request nonce** plus `'strict-dynamic'`. `src/proxy.ts` sets it on every request.
- The root layout (`src/app/[locale]/layout.tsx`) reads that nonce with `headers()` for the pre-paint theme script. Reading `headers()` makes every page render per request, which a nonce needs: a static file can't carry a fresh nonce.
- App Router pages also contain **inline scripts that Next writes** (the RSC payload, `self.__next_f.push(…)`). Their content differs per page and per build. With a nonce, Next stamps them. Without one, the CSP has to allow each of them some other way.

## What a static page would need

- **Next's chunks** (`<script src>`): `'self'`, optionally with build-time `integrity` from `experimental.sri` (Next 16 docs: `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`, "Subresource Integrity").
- **Our theme script:** a fixed string, so one `'sha256-…'` works everywhere, including in the nonce policy of `/app`.
- **Next's inline payload scripts:** each page's exact `'sha256-…'` list, known only after that page is prerendered.

The third item is where every route breaks down.

## Routes considered

### 1. Per-page hashes in the CSP header (blocked)

`next build` compiles `proxy.ts` (and `next.config` `headers()`) **before** it prerenders the pages, so the proxy can't import a hash list that doesn't exist yet. Both workarounds are fragile:

- **A two-pass build:** build, hash the prerendered HTML into a JSON file the proxy imports, then build again. This needs byte-identical RSC payloads across the two builds (a pinned `generateBuildId`, deterministic output), and it doubles the Vercel build time. Any drift between the passes silently blocks scripts.
- **A runtime manifest:** the proxy fetches a hash list written after the build. Whether a postbuild file is deployed, and where, depends on Vercel's output collection, which we don't control. The proxy would also make a fetch on every request.

### 2. The header and a `<meta>` CSP, intersected (rejected by UX)

When a page has two policies, browsers enforce both, so a script must pass each:

- **Header** (static public routes only): today's directives, with `script-src 'self' 'unsafe-inline'`.
- **Meta tag** (`<meta http-equiv="Content-Security-Policy">`, first in `<head>`): a postbuild script injects it into every prerendered HTML file, with `script-src 'self' 'sha256-…'` for the theme script plus that page's own inline scripts, hashed from the built HTML.

The effective policy is as strict as today. **Rejected because the failure mode is silent:** a page served without its meta tag (an ISR re-render, a serving path that doesn't use the postbuild file, a missed file) falls back to the header alone, which is `'unsafe-inline'`, and the browser gives no sign. A build-time check can't cover serving paths we don't control. (A page's CSP meta tag also can't carry `frame-ancestors`; that would stay in the header.)

### 3. `'unsafe-inline'` on public pages (ruled out)

The public pages hold no user content, but this would loosen A1, and UX ruled out any `'unsafe-inline'` fallback.

## What it would take to revisit

- **Next support for hashing its own inline scripts at build time** and handing them to the response headers (or to the proxy). If `experimental.sri` grows to cover inline payload scripts, route 1 becomes simple.
- **Or the two-pass build,** if deterministic builds can be guaranteed and checked: the second pass would fail when any page's hashes differ from the first.

Measure the before and after the way UX set for this spike: the Playwright Performance API plus the #76 vitals tool, local build vs local build on the same machine with the same throttling, 5 runs each, medians. Acceptance is the Web Tester's jcsp walk with 0 violations on the static pages in 3 browsers.

## Today

The public pages stay dynamic with per-request nonces. Without paid traffic their speed is fine (UX). Nothing in this write-up changed any code.
