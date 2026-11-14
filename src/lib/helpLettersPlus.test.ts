// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_LOCALES } from "@/i18n/routing";
import { findArticle, renderArticle } from "./helpContent";
import { isPendingMet } from "./legalContent";

// Letters to future you are part of Plus (1.3 §3): the letters article says so, in each language,
// only once Plus is on; and it says the letters already written stay openable, Plus or not.
const LOCALES = ALL_LOCALES.filter((l) => findArticle(l, "letters"));

describe("Help: letters and Moodbow Plus", () => {
  it("names Plus only with plus on", () => {
    const lettersOn = (id: string) => id === "letters_live" || id === "app_letters" || isPendingMet(id);
    for (const locale of LOCALES) {
      const off = renderArticle(findArticle(locale, "letters")!, (id) => id !== "plus" && lettersOn(id));
      const on = renderArticle(findArticle(locale, "letters")!, (id) => id === "plus" || lettersOn(id));
      expect(off, locale).not.toContain("Moodbow Plus");
      expect(on, locale).toContain("<strong>Moodbow Plus</strong>");
    }
  });
  it("in English: writing needs Plus; opening, deleting and export never do", () => {
    const on = (id: string) => id === "plus" || id === "letters_live" || id === "app_letters" || isPendingMet(id);
    const en = renderArticle(findArticle("en", "letters")!, on).replaceAll("&#39;", "'");
    expect(en).toContain("Writing a new letter is part of");
    expect(en).toContain("always yours, Plus or not");
    expect(en).toContain("delete them and export them at any time");
  });
});
