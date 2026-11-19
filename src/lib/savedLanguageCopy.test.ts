import { readFileSync } from "node:fs";
import type { AbstractIntlMessages } from "next-intl";
import { describe, expect, it } from "vitest";
import { savedLanguageCopy } from "./savedLanguageCopy";

const LOCALES = ["en", "es", "fr", "de", "it", "pt-br", "th"];
const messages: Record<string, AbstractIntlMessages> = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")) as AbstractIntlMessages]));
const of = (l: string) => messages[l];
// A message by its dotted key, as a string.
const at = (l: string, key: string) => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], messages[l]) as string;

describe("savedLanguageCopy (#401): the move's words in their language, the stay and close in this page's", () => {
  it("English saved, a Portuguese page", () => {
    expect(savedLanguageCopy("en", "pt-br", of)).toEqual({
      lang: "en",
      setTo: "Your journal is set to English.",
      continueIn: "Continue in English",
      switchTo: "Switch to English",
      stay: "Ficar em português",
      close: at("pt-br", "safety.safetyClose"),
    });
  });

  it("German saved, a French page: German's own name in German, French's in French", () => {
    const copy = savedLanguageCopy("de", "fr", of);
    expect(copy.setTo).toBe("Dein Tagebuch ist auf Deutsch eingestellt.");
    expect(copy.continueIn).toBe("Weiter auf Deutsch");
    expect(copy.stay).toBe("Rester en français");
  });

  // UX, 20 Nov: inside a sentence Portuguese, Spanish and French write their language in lower case; German (a noun)
  // and English keep the capital.
  it("a language's name inside a sentence: lower case in pt, es and fr, capitalised in de and en", () => {
    expect(savedLanguageCopy("pt-br", "en", of)).toMatchObject({ setTo: "Seu diário está em português.", continueIn: "Continuar em português", switchTo: "Mudar para português" });
    expect(savedLanguageCopy("es", "en", of)).toMatchObject({ setTo: "Tu diario está en español.", continueIn: "Continuar en español", switchTo: "Cambiar a español" });
    expect(savedLanguageCopy("fr", "en", of)).toMatchObject({ setTo: "Votre journal est en français.", continueIn: "Continuer en français", switchTo: "Passer en français" });
    expect(savedLanguageCopy("en", "pt-br", of).stay).toBe("Ficar em português");
    expect(savedLanguageCopy("en", "es", of).stay).toBe("Quedarme en español");
    expect(savedLanguageCopy("en", "fr", of).stay).toBe("Rester en français");
    expect(savedLanguageCopy("en", "de", of).stay).toBe("Auf Deutsch bleiben");
    expect(savedLanguageCopy("de", "en", of).continueIn).toBe("Weiter auf Deutsch");
    expect(savedLanguageCopy("en", "de", of).setTo).toBe("Your journal is set to English.");
  });

  it("every pair of languages: each string there, its name filled in", () => {
    for (const target of LOCALES) {
      for (const here of LOCALES) {
        if (target === here) continue;
        const copy = savedLanguageCopy(target, here, of);
        for (const [key, value] of Object.entries(copy)) {
          expect(value, `${target} on ${here}: ${key}`).toBeTruthy();
          expect(value, `${target} on ${here}: ${key}`).not.toContain("{");
        }
        // The language's own name as it writes it inside a sentence; the page's own for Stay.
        const name = at(target, "common.languageNameInSentence");
        for (const key of ["setTo", "continueIn", "switchTo"] as const) expect(copy[key], `${target}: ${key}`).toContain(name);
        expect(copy.stay, `${here}: stay`).toContain(at(here, "common.languageNameInSentence"));
      }
    }
  });
});
