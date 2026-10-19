import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { applyPending, isPendingMet, stripComments } from "./legalContent";

// Help & FAQ articles (item 8): content/help/<locale>/<slug>.md, copied
// verbatim from UX & PM's specs/help (long-form text in content files,
// decision 36). Each starts with front matter:
//   ---
//   title: …
//   summary: …
//   topic: one of TOPICS
//   ---
// {pending:<id>} blocks work as in the legal pages (lib/legalContent.ts): an
// article about a feature only says what's live. One whose body is empty
// once its pending blocks are removed isn't published at all.

export const TOPICS = ["Basics", "Your journal", "Settings", "AI", "Privacy & account", "Help"] as const;
export type Topic = (typeof TOPICS)[number];

export type HelpArticle = { slug: string; title: string; summary: string; topic: Topic; source: string };

const HELP_DIR = path.join(process.cwd(), "content", "help");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseArticle(slug: string, raw: string): HelpArticle {
  const text = raw.replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Help article ${slug}: missing front matter`);
  const meta = Object.fromEntries(
    match[1].split("\n").map((line) => {
      const at = line.indexOf(":");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
  );
  if (!meta.title || !meta.summary) throw new Error(`Help article ${slug}: needs a title and a summary`);
  if (!(TOPICS as readonly string[]).includes(meta.topic)) throw new Error(`Help article ${slug}: unknown topic "${meta.topic}"`);
  return { slug, title: meta.title, summary: meta.summary, topic: meta.topic as Topic, source: match[2] };
}

export function helpArticles(locale: string): HelpArticle[] {
  const dir = path.join(HELP_DIR, locale);
  if (!fs.existsSync(dir)) throw new Error(`Missing help articles: content/help/${locale}`);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .filter((slug) => SLUG.test(slug))
    .sort()
    .map((slug) => parseArticle(slug, fs.readFileSync(path.join(dir, `${slug}.md`), "utf8")));
}

// The article as Production shows it: unmet pending blocks removed.
export function renderArticle(article: HelpArticle, met: (id: string) => boolean = isPendingMet): string {
  const { text } = applyPending(stripComments(article.source), met);
  return text.trim() ? (marked.parse(text.trim(), { async: false, gfm: true }) as string) : "";
}

// The published articles, grouped by topic in TOPICS order.
export function helpIndex(locale: string, met: (id: string) => boolean = isPendingMet): { topic: Topic; articles: HelpArticle[] }[] {
  const published = helpArticles(locale).filter((a) => renderArticle(a, met) !== "");
  return TOPICS.map((topic) => ({ topic, articles: published.filter((a) => a.topic === topic) })).filter((g) => g.articles.length > 0);
}

export function findArticle(locale: string, slug: string): HelpArticle | null {
  if (!SLUG.test(slug)) return null;
  return helpArticles(locale).find((a) => a.slug === slug) ?? null;
}
