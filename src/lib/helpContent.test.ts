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
  it("live on Production: the app's Me → Help & FAQ opens it", () => {
    for (const path of ["/help", "/help/check-ins", "/help/delete-account"]) {
      expect(isHiddenPage(path, { vercelEnv: "production" }), path).toBe(false);
    }
  });

  // What the 0.9 app build has (the Mobile Dev's list): shown; the rest, and
  // the web journal's lines, hidden until their own conditions.
  const published = (slug: string) => renderArticle(findArticle("en", slug)!);

  it("articles about features that are off have nothing left: a 404", () => {
    for (const slug of ["ai-reflections", "import", "keyboard-shortcuts", "widget", "your-week"]) {
      expect(published(slug), slug).toBe("");
    }
  });

  it("the app's app lock shows (decision 188), without the widget it doesn't have yet", () => {
    expect(published("app-lock")).toContain("Forgot your PIN?");
    expect(published("app-lock")).not.toContain("widget");
  });

  it("the app's on this day, daily reminder, offline start and month share card show", () => {
    expect(published("on-this-day")).toContain("Hide for today");
    expect(published("offline")).toContain("opens without a connection");
    expect(published("reminders")).toContain("Daily reminder");
    expect(published("share-card")).toContain("Moodbow rainbow");
    expect(published("timeline")).toContain("Share this month");
    // More cards and the year card aren't in the build.
    expect(published("share-card")).not.toContain("Milestone");
  });

  it("the app's start without an email (0.9.4, decision 216): getting started and backing up show", () => {
    expect(published("getting-started")).toContain("Skip for now");
    expect(published("getting-started")).not.toContain("Create your account");
    expect(published("backing-up")).toContain("Back up your journal");
    expect(findArticle("en", "backing-up")!.topic).toBe("Privacy & account");
  });

  // The app releases' features (UX 2026-11-03): each article or line shows
  // once its help-only app id is met (the app build people have), in en and
  // th, with the app's way (✕ or Back) and no web-only steps until the web
  // journal is live.
  describe("0.9.5 / 0.9.6: shown by the app build people have", () => {
    // Both ways named, so these hold whether or not the id is met in
    // content/conditions.json yet (the 0.9.5 / 0.9.6 flips just flip it).
    const withMet = (on: string[], off: string[] = []) => (id: string) => on.includes(id) || (!off.includes(id) && isPendingMet(id));
    const render = (locale: string, slug: string, on: string[], off: string[] = []) => renderArticle(findArticle(locale, slug)!, withMet(on, off));
    for (const [id, slug, text] of [
      ["app_calendar", "calendar", "Calendar"],
      ["app_search", "search", "(or use Back)"],
      ["app_export_csv", "privacy-and-data", "Spreadsheet (.csv)"],
      ["app_writing_prompts", "entries", "Another"],
      ["app_share_cards_more", "share-card", "Milestone"],
      ["app_year_card", "share-card", "twelve bands"],
    ] as const) {
      it(`${id}: ${slug} says "${text}" only once it's met`, () => {
        expect(render("en", slug, [], [id]), id).not.toContain(text);
        expect(render("en", slug, [id]), id).toContain(text);
        // th has the same block (parity), so it appears with the same id.
        expect(render("th", slug, [], [id]), id).not.toBe(render("th", slug, [id]));
      });
    }

    it("search and the CSV line: no web-only steps or web import while those are off", () => {
      const search = render("en", "search", ["app_search"], ["web_journal_live"]);
      expect(search).not.toContain("Esc");
      expect(render("en", "search", ["app_search", "web_journal_live"])).toContain("press Esc on the web");
      const csv = render("en", "privacy-and-data", ["app_export_csv"], ["import_live"]);
      expect(csv).toContain("Excel or Google Sheets.");
      expect(csv).not.toContain("import");
      expect(render("en", "privacy-and-data", ["app_export_csv", "import_live"])).toContain("which Moodbow can import again on the web.");
    });
  });

  // 0.9.5 is published (UX): calendar, search and the CSV line show, in en
  // and th, as the app has them; no web-only step or web import yet.
  it("the app's 0.9.5: the calendar and search articles and the CSV line are published, en and th", () => {
    const th = (slug: string) => renderArticle(findArticle("th", slug)!);
    const slugs = helpIndex("en").flatMap((g) => g.articles.map((a) => a.slug));
    expect(slugs).toEqual(expect.arrayContaining(["calendar", "search"]));
    expect(published("calendar")).toContain("<strong>Calendar</strong>");
    expect(th("calendar")).toContain("<strong>ปฏิทิน</strong>");
    expect(published("search")).toContain("(or use Back)");
    expect(published("search")).not.toContain("Esc");
    expect(th("search")).toContain("(หรือใช้ปุ่มย้อนกลับ)");
    expect(th("search")).not.toContain("Esc");
    expect(published("privacy-and-data")).toContain("<strong>Spreadsheet (.csv)</strong>");
    expect(published("privacy-and-data")).not.toContain("import");
    expect(th("privacy-and-data")).toContain("<strong>สเปรดชีต (.csv)</strong>");
  });

  it("no web journal line while it's off, and no AI line while AI is off", () => {
    expect(published("getting-started")).not.toContain("moodbow.com");
    expect(published("getting-started")).not.toContain("on the web");
    expect(published("backing-up")).not.toContain("moodbow.com");
    expect(published("offline")).not.toContain("browser");
    expect(published("sign-in")).not.toContain("on the web");
    expect(published("reminders")).not.toContain("on the web");
    expect(published("delete-account")).not.toContain("AI");
  });
});
