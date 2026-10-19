// @vitest-environment node
import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import { findArticle, helpArticles, helpIndex, parseArticle, renderArticle, TOPICS } from "./helpContent";
import { isPendingMet, pendingIds } from "./legalContent";
import { isHiddenPage } from "./sitemapPages";

const all = () => helpArticles("en");

describe("help articles (content/help, copied verbatim from specs/help)", () => {
  it("each has a title, a summary and a known topic", () => {
    expect(all().length).toBeGreaterThanOrEqual(14);
    for (const a of all()) {
      expect(a.title, a.slug).not.toBe("");
      expect(a.summary, a.slug).not.toBe("");
      expect(TOPICS, a.slug).toContain(a.topic);
    }
  });

  it("every pending marker is well-formed (underscores) and a real condition", () => {
    for (const a of all()) {
      expect(a.source, a.slug).not.toMatch(/\{pending:[^}]*-[^}]*\}/);
      for (const id of pendingIds(a.source)) expect(() => isPendingMet(id), `${a.slug}: ${id}`).not.toThrow();
      // Every opening has its closing.
      expect((a.source.match(/\{pending:/g) ?? []).length, a.slug).toBe((a.source.match(/\{\/pending\}/g) ?? []).length);
    }
  });

  it("no article links to a page that's hidden on Production", () => {
    for (const a of all()) {
      for (const [, href] of renderArticle(a, () => true).matchAll(/href="([^"]+)"/g)) {
        if (href.startsWith("/")) expect(isHiddenPage(href, { vercelEnv: "production" }), `${a.slug} → ${href}`).toBe(false);
      }
    }
  });

  it("an article that's all pending isn't published; one with live text is", () => {
    const none = () => false;
    const slugs = helpIndex("en", none).flatMap((g) => g.articles.map((a) => a.slug));
    expect(slugs).not.toContain("ai-reflections");
    expect(slugs).not.toContain("share-card");
    expect(slugs).toContain("check-ins");
    expect(helpIndex("en", () => true).flatMap((g) => g.articles.map((a) => a.slug))).toContain("ai-reflections");
  });

  it("a removed whole-line bullet leaves no empty bullet (getting-started with AI off)", () => {
    const html = renderArticle(findArticle("en", "getting-started")!, () => false);
    expect(html).not.toMatch(/<li>\s*<\/li>/);
    expect(html).not.toContain("{pending");
  });

  it("the index keeps the topic order and every locale has its articles", () => {
    const topics = helpIndex("en", () => true).map((g) => g.topic);
    expect(topics).toEqual(TOPICS.filter((t) => topics.includes(t)));
    for (const locale of routing.locales) expect(helpArticles(locale).length).toBeGreaterThan(0);
  });

  it("parsing refuses a malformed article; unknown slugs aren't found", () => {
    expect(() => parseArticle("x", "no front matter")).toThrow();
    expect(() => parseArticle("x", "---\ntitle: T\nsummary: S\ntopic: Nope\n---\nbody")).toThrow();
    expect(findArticle("en", "../privacy")).toBeNull();
    expect(findArticle("en", "nope")).toBeNull();
  });
});

describe("Help is gated like the journal it describes (reviewer #23)", () => {
  it("hidden on Production while its condition is unmet, a draft on Previews", () => {
    for (const path of ["/help", "/help/check-ins", "/help/delete-account"]) {
      expect(isHiddenPage(path, { vercelEnv: "production" }), path).toBe(true);
      expect(isHiddenPage(path, { vercelEnv: "preview" }), path).toBe(false);
    }
  });
});
