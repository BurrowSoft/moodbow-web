// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import conditions from "../../content/conditions.json";
import { findArticle, renderArticle } from "./helpContent";
import { isPendingMet } from "./legalContent";

// Voice entries in Help (UX 14 Nov; 1.3 part 2 §4): the Writing entries article says where Speak
// instead is, in 7 languages, only once the app build people have has it (app-voice, help only,
// the decision 212 pattern). The web has no voice, so the label is the app's: voiceSpeak in its
// ARBs at voice/app f74dec5, copied here word for word.
const SPEAK: Record<string, string> = {
  en: "Speak instead",
  fr: "Parler plutôt",
  es: "Hablar en su lugar",
  "pt-br": "Falar em vez disso",
  de: "Stattdessen sprechen",
  it: "Parla invece",
  th: "พูดแทน",
};
// The renderer writes ' as &#39;: compared as text.
const render = (l: string, on: boolean) => renderArticle(findArticle(l, "entries")!, (id) => (id === "app_voice" ? on : isPendingMet(id))).replace(/&#39;/g, "'");

describe("Help → Writing entries: Speak instead (app only)", () => {
  for (const [l, label] of Object.entries(SPEAK)) {
    it(`${l}: the app's own label in bold once app-voice is met, and nothing of it before`, () => {
      expect(render(l, true)).toContain(`<strong>${label}</strong>`);
      expect(render(l, false)).not.toContain(`<strong>${label}</strong>`);
      expect(readFileSync(`content/help/${l}/entries.md`, "utf8")).toContain("{pending:app_voice}");
    });
  }

  it("says the voice never leaves the phone and only the kept text is saved (en)", () => {
    const en = render("en", true);
    expect(en).toContain("Your voice never leaves your phone; only the text you keep is saved, like any entry.");
    expect(en).toContain("the button doesn't appear");
  });

  it("not met yet: the app's voice ships after 1.2", () => {
    expect(conditions["app-voice"].met).toBe(false);
  });
});
