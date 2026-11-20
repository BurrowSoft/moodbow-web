// /account-deletion is a help page, not legal text (UX, 20 Nov, replacing #112's "treated as legal"): each live
// language shows its own words, with no "in English" line. A language that isn't live yet (it, th: drafts nobody has
// reviewed) shows the English under its legalEnglishOnly line until it goes live (UX, 20 Nov).
export const ACCOUNT_DELETION_LOCALES: readonly string[] = ["en", "fr", "es", "pt-br", "de"];
export const accountDeletionTextLocale = (locale: string) => (ACCOUNT_DELETION_LOCALES.includes(locale) ? locale : "en");
