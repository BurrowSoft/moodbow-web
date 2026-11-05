// @vitest-environment node
import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import label from "../../content/contracts/get-help-label.json";
import { ALL_LOCALES, dataLocale } from "@/i18n/routing";
import en from "./en.json";
import de from "./de.json";
import es from "./es.json";
import fr from "./fr.json";
import it_ from "./it.json";
import ptBr from "./pt-br.json";

// The draft languages (localization plan; Thai has th.test): every key of
// en.json, with the same placeholders, so a draft can't drift from English.
// The gates are in routing.ts: not served on Production until offered.
const flatten = (obj: unknown, prefix = ""): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v, key));
    else out[key] = String(v);
  }
  return out;
};
type Node = { type: number; value?: string; options?: Record<string, { value: Node[] }>; children?: Node[] };
const args = (msg: string) => {
  const names = new Set<string>();
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.type !== 0 && n.type !== 7 && n.value) names.add(`${n.value}:${n.type === 5 ? "select" : "value"}`);
      if (n.options) for (const o of Object.values(n.options)) walk(o.value);
      if (n.children) walk(n.children);
    }
  };
  walk(new IntlMessageFormat(msg, "en", undefined, { ignoreTag: true }).getAst() as Node[]);
  return [...names].sort();
};
const E = flatten(en);
const DRAFTS = { fr, es, "pt-br": ptBr, de, it: it_ } as const;

// `one` also covers 0 in French and Portuguese: a literal 1 goes under =1.
describe("counts where 0 isn't 1", () => {
  const say = (msg: string, locale: string, values: Record<string, number>) => new IntlMessageFormat(msg, locale).format(values);
  it.each([["fr", fr, "0 notes", "1 note"], ["pt-BR", ptBr, "0 anotações", "1 anotação"]] as const)("%s: search results", (locale, m, zero, one) => {
    expect(say(m.timeline.searchResultsCount, locale, { n: 0 })).toBe(zero);
    expect(say(m.timeline.searchResultsCount, locale, { n: 1 })).toBe(one);
  });
  it.each([["fr", fr], ["pt-BR", ptBr]] as const)("%s: the sign-in countdown at 0 doesn't say 1", (locale, m) => {
    expect(say(m.emailConfirmed.emailConfirmedRedirectSignIn, locale, { seconds: 0 })).toContain("0");
    expect(say(m.emailConfirmed.emailConfirmedRedirectSignIn, locale, { seconds: 1 })).toContain("1");
  });
  it("no plural in any language has a literal 1 under one", () => {
    for (const m of [en, ...Object.values(DRAFTS)]) {
      for (const [key, msg] of Object.entries(flatten(m))) expect(msg, key).not.toMatch(/\bone\s*\{[^{}]*\b1\b/);
    }
  });
  it("the import's preview: one day, one note; and a large count is grouped", () => {
    const preview = (msg: string, locale: string, days: number, notes: number) => new IntlMessageFormat(msg, locale).format({ days, notes, first: "a", last: "b" });
    expect(preview(en.me.importPreview, "en", 1, 1)).toBe("1 day and 1 note found, from a to b.");
    expect(preview(en.me.importPreview, "en", 2, 0)).toBe("2 days and 0 notes found, from a to b.");
    expect(preview(fr.me.importPreview, "fr", 1, 1)).toBe("1 jour et 1 note trouvés, du a au b.");
    expect(preview(fr.me.importPreview, "fr", 2000, 0)).not.toContain("2000");
  });

  it("search results group a large count", () => {
    expect(say(fr.timeline.searchResultsCount, "fr", { n: 1000 })).not.toContain("1000");
  });
});

describe.each(Object.entries(DRAFTS))("%s.json", (locale, messages) => {
  const M = flatten(messages);
  it("has exactly en.json's keys", () => {
    expect(Object.keys(M).sort()).toEqual(Object.keys(E).sort());
  });
  it("uses the same placeholders as English", () => {
    for (const key of Object.keys(E)) expect(args(M[key]), key).toEqual(args(E[key]));
  });
  it("is in ALL_LOCALES and names every language", () => {
    expect(ALL_LOCALES).toContain(locale);
    for (const l of ALL_LOCALES) expect(M[`common.languageNames.${l}`], l).toBeTruthy();
  });
  // The reflect function names this button in crisis replies. French has a
  // no-break space before "?": the comparison normalises whitespace.
  it("the help button's label is the contract's", () => {
    const space = (s: string) => s.replace(/\s+/gu, " ");
    expect(space(M["me.meGetHelpNow"])).toBe(space((label.labels as Record<string, string>)[dataLocale(locale)]));
  });
});
