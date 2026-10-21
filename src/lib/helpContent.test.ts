// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_LOCALES, routing } from "@/i18n/routing";
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
    for (const locale of [...routing.locales, ...ALL_LOCALES]) expect(helpArticles(locale).length).toBeGreaterThan(0);
  });

  it("Thai (1.1 F) has every English article: the same slugs, topics and pending blocks, each parsing", () => {
    const en = helpArticles("en");
    const th = helpArticles("th");
    expect(th.map((a) => a.slug)).toEqual(en.map((a) => a.slug));
    for (const a of th) {
      const e = en.find((x) => x.slug === a.slug)!;
      expect(a.topic, a.slug).toBe(e.topic);
      expect(pendingIds(a.source), a.slug).toEqual(pendingIds(e.source));
      expect(a.title, a.slug).not.toBe(e.title);
    }
    // Every article a /th build publishes renders (the build prerenders them all).
    for (const a of th) expect(() => renderArticle(a, () => true)).not.toThrow();
  });

  it("parsing refuses a malformed article; unknown slugs aren't found", () => {
    expect(() => parseArticle("x", "no front matter")).toThrow();
    expect(() => parseArticle("x", "---\ntitle: T\nsummary: S\ntopic: Nope\n---\nbody")).toThrow();
    expect(findArticle("en", "../privacy")).toBeNull();
    expect(findArticle("en", "nope")).toBeNull();
  });
});

describe("Help is public, scoped to what's live (decision 212)", () => {
  it("live on Production (the app's Me → Help & FAQ opens it) and on Previews", () => {
    for (const path of ["/help", "/help/check-ins", "/help/delete-account"]) {
      expect(isHiddenPage(path, { vercelEnv: "production" }), path).toBe(false);
      expect(isHiddenPage(path, { vercelEnv: "preview" }), path).toBe(false);
    }
  });

  // What the 0.9 app build has (the Mobile Dev's list): shown; the rest, and
  // the web journal's lines, hidden until their own conditions.
  const published = (slug: string) => renderArticle(findArticle("en", slug)!);

  it("articles about features that are off have nothing left: a 404", () => {
    for (const slug of ["ai-reflections", "calendar", "import", "keyboard-shortcuts", "search", "widget", "your-week"]) {
      expect(published(slug), slug).toBe("");
    }
  });

  it("the app's app lock shows (decision 188), without the widget it doesn't have yet", () => {
    expect(published("app-lock")).toContain("Forgot your PIN?");
    expect(published("app-lock")).not.toContain("widget");
  });

  it("the app's on this day, daily reminder and month share card show", () => {
    expect(published("on-this-day")).toContain("Hide for today");
    expect(published("reminders")).toContain("Daily reminder");
    expect(published("share-card")).toContain("Moodbow rainbow");
    expect(published("timeline")).toContain("Share this month");
    // More cards and the year card aren't in the build.
    expect(published("share-card")).not.toContain("Milestone");
  });

  // The web journal's lines follow web-journal-live (the web launch step
  // shows them), the AI line ai-live: these hold before and after each flip.
  it("the web journal's lines show only with the web journal, the AI line only with AI", () => {
    const web = isPendingMet("web_journal_live");
    expect(published("getting-started").includes("moodbow.com")).toBe(web);
    expect(published("offline").includes("browser")).toBe(web);
    expect(published("sign-in").includes("on the web")).toBe(web);
    expect(published("reminders").includes("on the web")).toBe(web);
    expect(published("delete-account").includes("AI")).toBe(isPendingMet("ai_live"));
  });
});
