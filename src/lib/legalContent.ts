import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import conditions from "../../content/conditions.json";
import { pageGate, type ConditionId, type PageGate } from "./conditions";
import { wholeNamesHtml } from "./wholeNames";

// The privacy policy and terms (W3) live as Markdown per locale:
// content/legal/<locale>/<slug>.md, copied from UX & PM's specs. Long-form
// text sits in content files, not in messages (decision 36).
// - {pending:<id>}…{/pending} renders only when the condition
//   <id with "-" for "_"> is met (content/conditions.json); blocks can nest.
//   {pending:a|b} renders when either is met (a Help article about a
//   feature in the app build people have OR on the web). Unmet blocks are
//   removed exactly as Production would remove them.
// - ⏳(…), ⏳[…] and [VITOR] mark facts still to confirm. They're
//   highlighted on drafts, and a page can't go live while any remain
//   (legalContent.test.ts).
// - A locale without its file fails the build loudly (never a silent
//   fallback to English).
export type LegalSlug = "privacy" | "terms" | "consumer-health-data";
export type HiddenBlock = { id: string; text: string };

const LEGAL_DIR = path.join(process.cwd(), "content", "legal");
// Innermost first: a block whose content holds no other {pending:…}.
const PENDING = /\{pending:([a-z_]+(?:\|[a-z_]+)*)\}((?:(?!\{pending:)[\s\S])*?)\{\/pending\}/;
const TODO = /⏳\([^)]*\)|⏳\[[^\]]*\]|⏳|\[VITOR\]/g;

export function conditionForPending(id: string): string {
  return id.replace(/_/g, "-");
}

// Every condition id named, each alternative of an "a|b" block on its own.
export function pendingIds(source: string): string[] {
  return [...source.matchAll(/\{pending:([a-z_]+(?:\|[a-z_]+)*)\}/g)].flatMap((m) => m[1].split("|"));
}

export function isPendingMet(id: string): boolean {
  const entry = (conditions as Record<string, { met: boolean }>)[conditionForPending(id)];
  if (!entry) throw new Error(`Unknown pending condition "${id}" (add ${conditionForPending(id)} to content/conditions.json)`);
  return entry.met === true;
}

export function applyPending(source: string, met: (id: string) => boolean = isPendingMet): { text: string; hidden: HiddenBlock[] } {
  let text = source;
  const hidden: HiddenBlock[] = [];
  for (let m = PENDING.exec(text); m; m = PENDING.exec(text)) {
    const [whole, id, content] = m;
    const keep = id.split("|").some((one) => met(one));
    if (!keep) hidden.push({ id, text: content.trim() });
    let end = m.index + whole.length;
    // An unmet block that fills its whole line (e.g. a table row) takes its
    // line break with it: a blank line left mid-table would end the table,
    // and the rows after it would render as literal "| … |" text.
    const startsLine = m.index === 0 || text[m.index - 1] === "\n";
    if (!keep && startsLine && text[end] === "\n") end += 1;
    text = text.slice(0, m.index) + (keep ? content : "") + text.slice(end);
  }
  return { text, hidden };
}

// The legal text as it will read once the noticed change applies (the policy's §8): the pending
// ids in COMING are in, everything else as it is today. Now: Moodbow Plus (its purchases, Stripe,
// the stores' rows, the payment-records bullet). Change it with the next noticed change.
export const COMING_POLICY: readonly string[] = ["plus"];
export const comingPolicyMet = (id: string) => COMING_POLICY.includes(id) || (pendingKnown(id) && isPendingMet(id));
const pendingKnown = (id: string) => conditionForPending(id) in (conditions as Record<string, unknown>);

// The What changed block's date (#378): the day the noticed change applies, read from the same
// notice id as Today's card (app_config.policy_notice_id, "YYYY-MM-DD" or "YYYY-MM-DD-<slug>"),
// so the policy and the card can never name different days. {dated}…{/dated} shows only with a
// date, with {notice_date} inside it as that date; {undated}…{/undated} shows only without one.
// A text that still holds these markers after its pending blocks needs the date to render:
// renderLegal throws without it. A page that never shows the block never looks the date up.
const DATED = /\{dated\}([\s\S]*?)\{\/dated\}/g;
const UNDATED = /\{undated\}([\s\S]*?)\{\/undated\}/g;
const NOTICE_MARK = /\{(?:\/?dated|\/?undated|notice_date)\}/;

export function needsNoticeDate(source: string, met: (id: string) => boolean = isPendingMet): boolean {
  return NOTICE_MARK.test(applyPending(stripComments(source), met).text);
}

export function applyNoticeDate(text: string, date: string | null): string {
  const out = text
    .replace(DATED, (_, inner: string) => (date ? inner.replace(/\{notice_date\}/g, () => date) : ""))
    .replace(UNDATED, (_, inner: string) => (date ? "" : inner));
  if (NOTICE_MARK.test(out)) throw new Error("Legal text: a {notice_date} outside {dated}…{/dated}, or a block left open");
  return out;
}

// A notice day (YYYY-MM-DD) as the legal text writes its dates: "1 December 2026" in English,
// "1 de diciembre de 2026" in Spanish. The text's language, not the page's: an English policy
// under /fr keeps English dates.
export function legalDate(day: string, textLocale: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const tag = textLocale === "en" ? "en-GB" : textLocale;
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

// HTML comments (the file header) are notes for editors, never published.
export function stripComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->\n?/g, "");
}

export function todos(source: string): string[] {
  return stripComments(source).match(TODO) ?? [];
}

// The translations that exist, page by page, each behind its own approval. Consumer Health Data
// stays English in every language.
const TRANSLATED: Partial<Record<string, { condition: ConditionId; slugs: readonly LegalSlug[] }>> = {
  // Privacy joins once its catch-up with the current English is approved (UX 19 Nov, option a).
  es: { condition: "legal-es-approved", slugs: ["terms"] },
};

// The language a page's legal text is in: its own where it has been translated and approved
// (Previews show drafts), else English (1.1 F: English text under legalEnglishOnly).
export function legalLocale(locale: string, slug: LegalSlug, gate: (id: ConditionId) => PageGate = pageGate): string {
  const own = TRANSLATED[locale];
  return own && own.slugs.includes(slug) && gate(own.condition) !== "hidden" ? locale : "en";
}

export function legalSource(slug: LegalSlug, locale: string): string {
  const file = path.join(LEGAL_DIR, locale, `${slug}.md`);
  if (!fs.existsSync(file)) throw new Error(`Missing legal text: content/legal/${locale}/${slug}.md`);
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

export type LegalPage = { title: string; html: string; hidden: HiddenBlock[] };

// noticeDate: the What changed block's date (legalDate), null for an undated notice; leave it
// out only for a text that doesn't show the block (see applyNoticeDate).
export function renderLegal(source: string, met: (id: string) => boolean = isPendingMet, noticeDate?: string | null): LegalPage {
  const pending = applyPending(stripComments(source), met);
  const { hidden } = pending;
  let { text } = pending;
  if (NOTICE_MARK.test(text)) {
    if (noticeDate === undefined) throw new Error("This legal text shows the What changed block: pass its notice date (null for an undated notice)");
    text = applyNoticeDate(text, noticeDate);
  }
  // The first "## " line is the page title (the page's h1); sections move
  // up one level so the outline has no gaps (### → h2).
  const lines = text.trim().split("\n");
  const titleLine = lines.findIndex((l) => l.startsWith("## "));
  if (titleLine < 0) throw new Error("Legal text needs a '## Title' line");
  const title = lines[titleLine].slice(3).trim();
  const body = lines
    .filter((_, i) => i !== titleLine)
    .join("\n")
    .replace(/^### /gm, "## ")
    .replace(TODO, (t) => `<mark class="legal-todo">${t}</mark>`);
  const html = marked.parse(body, { async: false, gfm: true }) as string;
  // Names never hyphenate (UX, 19 Nov), even where the large-text hyphen rule is on.
  return { title, html: scrollableTables(wholeNamesHtml(html)), hidden };
}

// A wide table scrolls sideways on a phone, so its scroller must be
// reachable by keyboard (axe scrollable-region-focusable, Web Tester): each
// table goes in a focusable region named by the section it's in (its h2's
// text, already escaped by marked), "Table" if none. Markup only: the
// legal text itself is unchanged.
export function scrollableTables(html: string): string {
  let heading = "";
  return html.replace(/<h2[^>]*>([\s\S]*?)<\/h2>|<table>([\s\S]*?)<\/table>/g, (match, h2: string | undefined) => {
    if (h2 !== undefined) {
      heading = h2.replace(/<[^>]+>/g, "").trim();
      return match;
    }
    return `<div class="table-scroll" role="region" tabindex="0" aria-label="${heading || "Table"}">${match}</div>`;
  });
}
