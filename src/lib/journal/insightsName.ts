// Insights' name, at parity with the app's build 3 (UX, 27 Nov): "AI & Insights" only where AI is shown
// to this person (aiShown: the global switch and ai-live), else "Insights" as before, so a journal
// without AI has no word of AI. Every place that names the destination takes its keys from here, with
// the one answer the server worked out from this request's `me` (the layout's, the page's and the
// title's are the same read: React's cache). Nothing on the client guesses or flips it. Not known
// (no `me`) counts as no AI.
// tab, title, shortcut: the visible names (the tab, the page heading, the "i" shortcut's label).
// spoken: an accessible name with no visible text of its own (Back, the tab's own name, the tab
// list's): "and" where the visible name has "&" (UX; the app's semantics label).
export type InsightsName = {
  tab: "tabInsights" | "tabInsightsNoAi";
  spoken: "tabInsightsSpoken" | "tabInsightsNoAi";
  title: "insightsTitle" | "insightsTitleNoAi";
  shortcut: "shortcutInsights" | "shortcutInsightsNoAi";
};

const WITH_AI: InsightsName = { tab: "tabInsights", spoken: "tabInsightsSpoken", title: "insightsTitle", shortcut: "shortcutInsights" };
const WITHOUT_AI: InsightsName = { tab: "tabInsightsNoAi", spoken: "tabInsightsNoAi", title: "insightsTitleNoAi", shortcut: "shortcutInsightsNoAi" };

// tab and spoken are app.* keys, title insights.*, shortcut me.*.
export function insightsName(ai: boolean | undefined): InsightsName {
  return ai === true ? WITH_AI : WITHOUT_AI;
}
