import { defineRouting } from "next-intl/routing";

// English only for the beta (decision #32). Adding a language later
// (th, es, pt-BR, fr, de) = add it here + src/messages/<locale>.json with every
// key (src/messages/messages.test.ts checks parity); English stays at /, the
// others get a /<locale> prefix.
export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
