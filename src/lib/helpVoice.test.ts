// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import conditions from "../../content/conditions.json";
import { findArticle, renderArticle } from "./helpContent";
import { isPendingMet } from "./legalContent";

// Voice entries in Help (UX 14 Nov; 1.3 part 2 §4): the Writing entries article says how to speak instead of typing,
// in 7 languages, only once the app build people have has it (app-voice, help only, the decision 212 pattern). The web
// has no voice. The app shows a microphone with no word on it (UX, 20 Nov), so the line is a description in bold, not
// a button's label, and says "tap the microphone".
const SPEAK: Record<string, string> = {
  en: "Speak instead of typing",
  fr: "Parler au lieu de taper",
  es: "Hablar en vez de escribir",
  "pt-br": "Falar em vez de digitar",
  de: "Sprechen statt tippen",
  it: "Parla invece di scrivere",
  th: "พูดแทนการพิมพ์",
};
// The renderer writes ' as &#39;: compared as text.
const render = (l: string, on: boolean) => renderArticle(findArticle(l, "entries")!, (id) => (id === "app_voice" ? on : isPendingMet(id))).replace(/&#39;/g, "'");

describe("Help → Writing entries: speaking instead of typing (app only)", () => {
  for (const [l, label] of Object.entries(SPEAK)) {
    it(`${l}: in bold once app-voice is met, and nothing of it before`, () => {
      expect(render(l, true)).toContain(`<strong>${label}</strong>`);
      expect(render(l, false)).not.toContain(`<strong>${label}</strong>`);
      expect(readFileSync(`content/help/${l}/entries.md`, "utf8")).toContain("{pending:app_voice}");
    });
  }

  it("says the voice never leaves the phone and only the kept text is saved (en)", () => {
    const en = render("en", true);
    expect(en).toContain("Your voice never leaves your phone; only the text you keep is saved, like any entry.");
    expect(en).toContain("tap the microphone in the writing space");
    expect(en).toContain("the microphone doesn't appear");
  });

  it("met with the app release that has it: 1.4.0 on Google Play (group 5, 20 Nov)", () => {
    expect(conditions["app-voice"].met).toBe(true);
  });
});
