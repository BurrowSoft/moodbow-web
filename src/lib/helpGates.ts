import { routing } from "../i18n/routing";
import { conditionMet, pageGate, type ConditionId } from "./conditions";
import gates from "./helpGates.json";

// Which Help articles are published, without reading content/help (the proxy can't): from
// helpGates.json, written by scripts/help-gates.mjs and checked against the sources by
// helpGates.test.ts. Same answer as helpContent's renderArticle(article, helpPageMet) !== "".
export type HelpGate = true | { ids: string[]; then: HelpGate }[];

const GATES = gates as Record<string, Record<string, HelpGate>>;

// helpPageMet without helpContent (fs, marked): Bo's article follows Bo's own gate, so it can
// be read on a Preview; every other block, its condition.
export const helpIdMet = (id: string, build?: Parameters<typeof pageGate>[1]): boolean => {
  const condition = id.split("_").join("-") as ConditionId;
  return id === "bo_live" ? pageGate("bo-live", build) !== "hidden" : conditionMet(condition);
};

export function gatePublished(gate: HelpGate, met: (id: string) => boolean): boolean {
  return gate === true || gate.some((b) => b.ids.some(met) && gatePublished(b.then, met));
}

// A language whose Help isn't in yet reads the English articles (helpContent.helpArticles).
export function helpArticlePublished(locale: string, slug: string, met: (id: string) => boolean = (id) => helpIdMet(id)): boolean {
  const gate = (GATES[locale] ?? GATES[routing.defaultLocale])[slug];
  return gate !== undefined && gatePublished(gate, met);
}
