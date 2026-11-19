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
      stay: "Ficar em Português",
      close: at("pt-br", "safety.safetyClose"),
    });
  });

  it("German saved, a French page: German's own name in German, French's in French", () => {
    const copy = savedLanguageCopy("de", "fr", of);
    expect(copy.setTo).toBe("Dein Tagebuch ist auf Deutsch eingestellt.");
    expect(copy.continueIn).toBe("Weiter auf Deutsch");
    expect(copy.stay).toBe("Rester en Français");
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
        const name = at(target, `common.languageNames.${target}`);
        for (const key of ["setTo", "continueIn", "switchTo"] as const) expect(copy[key], `${target}: ${key}`).toContain(name);
      }
    }
  });
});
