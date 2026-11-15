// @vitest-environment node
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGates, gateOf } from "../../scripts/help-gates.mjs";
import { helpArticles, renderArticle } from "./helpContent";
import { gatePublished, helpArticlePublished, type HelpGate } from "./helpGates";
import gates from "./helpGates.json";
import { pendingIds } from "./legalContent";

const LOCALES = Object.keys(gates);

describe("helpGates.json (the proxy's list of published Help articles)", () => {
  it("is up to date with content/help (else: node scripts/help-gates.mjs)", () => {
    expect(buildGates(path.join(process.cwd(), "content", "help"))).toEqual(gates);
  });

  // Exhaustive: every on/off combination of each article's own ids gives the same answer as
  // rendering it, in every language.
  it("publishes an article exactly when renderArticle leaves something", () => {
    for (const locale of LOCALES) {
      for (const article of helpArticles(locale)) {
        const ids = [...new Set(pendingIds(article.source))];
        expect(ids.length, `${locale}/${article.slug}`).toBeLessThanOrEqual(10);
        const gate = (gates as Record<string, Record<string, HelpGate>>)[locale][article.slug];
        for (let mask = 0; mask < 1 << ids.length; mask++) {
          const met = (id: string) => (mask & (1 << ids.indexOf(id))) !== 0;
          expect(gatePublished(gate, met), `${locale}/${article.slug} ${mask}`).toBe(renderArticle(article, met) !== "");
        }
      }
    }
  });

  it("reads nested blocks and text of the article's own", () => {
    expect(gateOf("Hello {pending:a}A{/pending}")).toBe(true);
    expect(gateOf("<!-- note -->\n{pending:a|b}A {pending:c}C{/pending}{/pending}\n")).toEqual([{ ids: ["a", "b"], then: true }]);
    expect(gateOf("{pending:a}{pending:c}C{/pending}{/pending}")).toEqual([{ ids: ["a"], then: [{ ids: ["c"], then: true }] }]);
    expect(() => gateOf("{pending:a}A")).toThrow("unclosed");
  });

  it("answers for the live conditions: a missing slug or one not out yet is unpublished", () => {
    expect(helpArticlePublished("en", "check-ins")).toBe(true);
    expect(helpArticlePublished("es", "get-help-now")).toBe(true);
    expect(helpArticlePublished("en", "no-such-article")).toBe(false);
    // Unmet on every build: safety-plan-live; letters also need Plus.
    expect(helpArticlePublished("en", "safety-plan")).toBe(false);
    expect(helpArticlePublished("fr", "letters")).toBe(false);
  });
});
