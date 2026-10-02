import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import conditions from "../../content/conditions.json";

// The privacy policy and terms (W3) live as Markdown per locale:
// content/legal/<locale>/<slug>.md, copied from UX & PM's specs. Long-form
// text sits in content files, not in messages (decision 36).
// - {pending:<id>}…{/pending} renders only when the condition
//   <id with "-" for "_"> is met (content/conditions.json); blocks can nest.
//   Unmet blocks are removed exactly as Production would remove them.
// - ⏳(…), ⏳[…] and [VITOR] mark facts still to confirm. They're
//   highlighted on drafts, and a page can't go live while any remain
//   (legalContent.test.ts).
// - A locale without its file fails the build loudly (never a silent
//   fallback to English).
export type LegalSlug = "privacy" | "terms";
export type HiddenBlock = { id: string; text: string };

const LEGAL_DIR = path.join(process.cwd(), "content", "legal");
// Innermost first: a block whose content holds no other {pending:…}.
const PENDING = /\{pending:([a-z_]+)\}((?:(?!\{pending:)[\s\S])*?)\{\/pending\}/;
const TODO = /⏳\([^)]*\)|⏳\[[^\]]*\]|⏳|\[VITOR\]/g;

export function conditionForPending(id: string): string {
  return id.replace(/_/g, "-");
}

export function pendingIds(source: string): string[] {
  return [...source.matchAll(/\{pending:([a-z_]+)\}/g)].map((m) => m[1]);
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
    const keep = met(id);
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

// HTML comments (the file header) are notes for editors, never published.
export function stripComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->\n?/g, "");
}

export function todos(source: string): string[] {
  return stripComments(source).match(TODO) ?? [];
}

export function legalSource(slug: LegalSlug, locale: string): string {
  const file = path.join(LEGAL_DIR, locale, `${slug}.md`);
  if (!fs.existsSync(file)) throw new Error(`Missing legal text: content/legal/${locale}/${slug}.md`);
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

export type LegalPage = { title: string; html: string; hidden: HiddenBlock[] };

export function renderLegal(source: string, met: (id: string) => boolean = isPendingMet): LegalPage {
  const { text, hidden } = applyPending(stripComments(source), met);
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
  return { title, html, hidden };
}
