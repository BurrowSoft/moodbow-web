import { createTranslator, type AbstractIntlMessages } from "next-intl";

// What the saved-language gate says (#401, UX 20 Nov). The move's own words are in the saved language, the one the
// person chose ("Your journal is set to English. Continue in English"), with lang= for screen readers; the way to
// stay and the notice's close are in the page's ("Ficar em português"). Each language's strings only ever take its
// own name, so the names are the languages' own (common.languageNames). Inside a sentence pt-br, es and fr write
// theirs in lower case (UX, 20 Nov), so their strings carry the name themselves; the {language} passed is unused there.
export type SavedLanguageCopy = {
  lang: string;
  setTo: string;
  continueIn: string;
  switchTo: string;
  stay: string;
  close: string;
};

// The project's typed messages give each key its own arguments from the app's types; these translators read another
// language's messages, handed in at run time, so they're typed loosely (savedLanguageCopy.test checks every pair).
type Loose = (key: string, values?: Record<string, string>) => string;

export function savedLanguageCopy(target: string, here: string, messagesOf: (locale: string) => AbstractIntlMessages): SavedLanguageCopy {
  const theirs = createTranslator({ locale: target, messages: messagesOf(target), namespace: "common" }) as unknown as Loose;
  const ours = createTranslator({ locale: here, messages: messagesOf(here) }) as unknown as Loose;
  const language = theirs(`languageNames.${target}`);
  return {
    lang: target,
    setTo: theirs("savedLanguageSetTo", { language }),
    continueIn: theirs("savedLanguageContinue", { language }),
    switchTo: theirs("savedLanguageSwitch", { language }),
    stay: ours("common.savedLanguageStay", { language: ours(`common.languageNames.${here}`) }),
    close: ours("safety.safetyClose"),
  };
}
