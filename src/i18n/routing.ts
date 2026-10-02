import { defineRouting } from "next-intl/routing";

// English at /, Thai at /th. More languages are added here and in
// src/messages (every key in every file; src/messages.test.ts checks it).
export const routing = defineRouting({
  locales: ["en", "th"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
