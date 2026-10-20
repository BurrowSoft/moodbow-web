// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { QUERY_RULES } from "../../scripts/queryRules.mjs";

// Decision 196: the lint guard that keeps user text out of PostgREST request
// URLs, tested on snippets with exactly the rules eslint.config.mjs uses.
const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [{ files: ["**/*.js"], rules: { "no-restricted-syntax": ["error", ...QUERY_RULES] } }],
});
const errors = async (code: string) => (await eslint.lintText(code, { filePath: "snippet.js" }))[0].messages.length;

describe("the decision-196 lint guard", () => {
  it("every URL text filter is an error, the AnyOf/AllOf forms included", async () => {
    for (const call of [
      'q.ilike("body", "%walk%")',
      'q.like("body", "walk")',
      'q.textSearch("body", "walk")',
      'q.or("body.ilike.%walk%")',
      'q.likeAnyOf("body", ["a", "b"])',
      'q.likeAllOf("body", ["a", "b"])',
      'q.ilikeAnyOf("body", ["a", "b"])',
      'q.ilikeAllOf("body", ["a", "b"])',
      'q.filter("body", "ilike", "%walk%")',
      'q.not("body", "ilike", "%walk%")',
    ]) {
      expect(await errors(`${call};`), call).toBe(1);
    }
  });

  it("what isn't a URL text filter passes: rpc, date and equality filters, Array.filter", async () => {
    for (const call of [
      'q.rpc("search_entries", { p_q: text, p_limit: 51 })',
      'q.gte("entry_date", from).lte("entry_date", to)',
      'q.eq("id", id).in("entry_date", dates)',
      "rows.filter((r) => r.mood !== null)",
      "rows.filter((r) => r, thisArg)",
    ]) {
      expect(await errors(`${call};`), call).toBe(0);
    }
  });
});
