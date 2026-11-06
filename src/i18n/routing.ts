import { defineRouting } from "next-intl/routing";
import { conditionMet, pageGate, type BuildEnv } from "@/lib/conditions";

// English, plus the languages behind their own offered condition (Thai 1.1 F;
// the others, localization plan). Adding a language = add it here and to
// OFFER_GATE + src/messages/<locale>.json with every key (i18n/locales.test.ts
// checks parity) + content/help/<locale>; English stays at /, the others get a
// /<locale> prefix.
export const ALL_LOCALES = ["en", "th", "fr", "es", "pt-br", "de", "it"] as const;
export type Locale = (typeof ALL_LOCALES)[number];

// The condition that offers each language. Until it's met, a language is a
// draft on test builds only (Preview, dev, the CI e2e build) and not served on
// Production.
export const OFFER_GATE = {
  th: "thai-offered-live",
  fr: "fr-offered-live",
  es: "es-offered-live",
  "pt-br": "pt-br-offered-live",
  de: "de-offered-live",
  it: "it-offered-live",
} as const;
export type OfferGate = (typeof OFFER_GATE)[keyof typeof OFFER_GATE];
const others = ALL_LOCALES.filter((l): l is Exclude<Locale, "en"> => l !== "en");

// Which languages this build serves: each once its gate is met, or as a draft
// on a test build (pageGate), so it can be read before the flip.
export function servedLocales(build?: BuildEnv, met: (id: OfferGate) => boolean = conditionMet): Locale[] {
  return ["en", ...others.filter((l) => pageGate(OFFER_GATE[l], build, () => met(OFFER_GATE[l])) !== "hidden")];
}

// Which languages are offered: the switcher, Me → Language, hreflang and the
// sitemap. Only once met: a draft is reachable by its address only, and nobody
// saves it to the profile (shared with the app) before the flip.
export function offeredLocales(met: (id: OfferGate) => boolean = conditionMet): Locale[] {
  return ["en", ...others.filter((l) => met(OFFER_GATE[l]))];
}

// The route's language as the data knows it (profiles.locale,
// user_metadata.locale, supported_locales, the contracts' names and labels):
// /pt-br is "pt", as in the app and send-email. Everything else is its own code.
export const dataLocale = (route: string): string => (route === "pt-br" ? "pt" : route);
// And back: a stored "pt" is the /pt-br route.
export const routeLocale = (data: string): string => (data === "pt" ? "pt-br" : data);

export const routing = defineRouting({
  locales: servedLocales(),
  defaultLocale: "en",
  localePrefix: "as-needed",
  // Matching a first visit to the browser's language only once a language is
  // offered. It matches what this build serves: on Production that's the offered
  // languages; on a test build, a Thai browser also lands on the draft /th.
  localeDetection: offeredLocales().length > 1,
});
