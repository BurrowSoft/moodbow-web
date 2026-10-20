import { defineRouting } from "next-intl/routing";
import { conditionMet, pageGate, type BuildEnv } from "@/lib/conditions";

// English, plus Thai (1.1 F) behind thai-offered-live. Adding a language
// later (es, pt-BR, fr, de) = add it here + src/messages/<locale>.json with
// every key (src/messages/messages.test.ts checks parity) + content/help/<locale>;
// English stays at /, the others get a /<locale> prefix.
export const ALL_LOCALES = ["en", "th"] as const;
export type Locale = (typeof ALL_LOCALES)[number];

// Which languages this build serves: Thai once thai-offered-live is met, or
// as a draft on a test build (Preview, dev, the CI e2e build: pageGate), so
// it can be read before the flip. Production stays English only until then.
export function servedLocales(build?: BuildEnv, met: (id: "thai-offered-live") => boolean = conditionMet): Locale[] {
  return met("thai-offered-live") || pageGate("thai-offered-live", build) === "draft" ? [...ALL_LOCALES] : ["en"];
}

// Which languages are offered: the switcher, Me → Language, hreflang and
// the sitemap. Only once met: a draft /th is reachable by its address only,
// and nobody saves "th" to the profile (shared with the app) before the flip.
export function offeredLocales(met: (id: "thai-offered-live") => boolean = conditionMet): Locale[] {
  return met("thai-offered-live") ? [...ALL_LOCALES] : ["en"];
}

export const routing = defineRouting({
  locales: servedLocales(),
  defaultLocale: "en",
  localePrefix: "as-needed",
  // Matching a first visit to the browser's language only once Thai is
  // offered: a Thai browser on a Preview stays on English at / (the draft
  // is reached by its address).
  localeDetection: offeredLocales().length > 1,
});
