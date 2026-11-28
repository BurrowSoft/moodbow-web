// @vitest-environment node
import { describe, expect, it } from "vitest";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import it_ from "@/messages/it.json";
import ptBr from "@/messages/pt-br.json";
import th from "@/messages/th.json";
import { insightsName } from "./insightsName";

// Insights' name (UX, 27 Nov; the app's build 3): "AI & Insights" only where AI is shown to this
// person, else the names it had before, with no word of AI.
const LOCALES = { en, fr, es, "pt-br": ptBr, de, it: it_, th } as const;
// UX's labels with AI, their spoken form (the app's semantics values: "and" for "&"), and the names kept
// without AI (master 3339e199).
const WITH_AI = { en: "AI & Insights", fr: "IA & Stats", es: "IA y resumen", "pt-br": "IA e Insights", de: "KI & Einblicke", it: "IA e andamento", th: "AI & ข้อมูลเชิงลึก" };
const SPOKEN = { en: "AI and Insights", fr: "IA et statistiques", es: "IA y resumen", "pt-br": "IA e Insights", de: "KI und Einblicke", it: "IA e andamento", th: "AI และข้อมูลเชิงลึก" };
const WITHOUT_AI = { en: "Insights", fr: "Statistiques", es: "Resumen", "pt-br": "Insights", de: "Einblicke", it: "Andamento", th: "ข้อมูลเชิงลึก" };
const AI_WORD = /(^|\s)(AI|IA|KI)(\s|$)/;

const names = (m: (typeof LOCALES)[keyof typeof LOCALES], ai: boolean | undefined) => {
  const n = insightsName(ai);
  return { tab: m.app[n.tab], spoken: m.app[n.spoken], title: m.insights[n.title], shortcut: m.me[n.shortcut] };
};

describe("insightsName: one answer for every place that names Insights", () => {
  it("AI shown: the AI keys; not shown, or not known: the keys without AI", () => {
    expect(insightsName(true)).toEqual({ tab: "tabInsights", spoken: "tabInsightsSpoken", title: "insightsTitle", shortcut: "shortcutInsights" });
    for (const ai of [false, undefined]) expect(insightsName(ai)).toEqual({ tab: "tabInsightsNoAi", spoken: "tabInsightsNoAi", title: "insightsTitleNoAi", shortcut: "shortcutInsightsNoAi" });
  });

  for (const [locale, m] of Object.entries(LOCALES) as [keyof typeof LOCALES, (typeof LOCALES)[keyof typeof LOCALES]][]) {
    it(`${locale}: the tab, the heading and the shortcut agree in each state; spoken says "and"; no AI word without AI`, () => {
      const on = names(m, true);
      expect({ tab: on.tab, title: on.title, shortcut: on.shortcut }).toEqual({ tab: WITH_AI[locale], title: WITH_AI[locale], shortcut: WITH_AI[locale] });
      expect(on.spoken).toBe(SPOKEN[locale]);
      expect(on.spoken).not.toContain("&");
      expect(on.tab).toMatch(AI_WORD);
      const off = names(m, false);
      expect(off).toEqual({ tab: WITHOUT_AI[locale], spoken: WITHOUT_AI[locale], title: WITHOUT_AI[locale], shortcut: WITHOUT_AI[locale] });
      expect(off.tab).not.toMatch(AI_WORD);
      expect(off.tab).not.toContain("&");
    });
  }
});
