// @vitest-environment node
import { readFileSync } from "node:fs";
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

  it.each(["th", "fr", "es", "pt-br", "de", "it"])("%s has every English article: the same slugs, topics and pending blocks, each parsing", (locale) => {
    const en = helpArticles("en");
    const articles = helpArticles(locale);
    expect(articles.map((a) => a.slug)).toEqual(en.map((a) => a.slug));
    for (const a of articles) {
      const e = en.find((x) => x.slug === a.slug)!;
      expect(a.topic, a.slug).toBe(e.topic);
      expect(pendingIds(a.source), a.slug).toEqual(pendingIds(e.source));
      expect(a.title, a.slug).not.toBe(e.title);
    }
    // Every article a build of this language publishes renders (the build prerenders them all).
    for (const a of articles) expect(() => renderArticle(a, () => true)).not.toThrow();
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
    for (const slug of ["ai-reflections", "your-week"]) {
      expect(published(slug), slug).toBe("");
    }
    // The shortcuts go live with the web launch step (UX 2026-11-04): a
    // 404 before it, published after.
    expect(published("keyboard-shortcuts") === "").toBe(!isPendingMet("shortcuts_live"));
    // The 0.9.7 app build's (UX): the widget, import and Patterns, a 404
    // until the app build people have has them (or the web, for import and
    // Patterns).
    const either = (...ids: string[]) => ids.some((id) => isPendingMet(id));
    expect(published("widget") === "", "widget").toBe(!either("widget_live"));
    expect(published("import") === "", "import").toBe(!either("app_import", "import_live"));
    expect(published("patterns") === "", "patterns").toBe(!either("app_patterns", "patterns_live"));
  });

  it("the app's app lock shows (decision 188), and its widget line only with the widget", () => {
    expect(published("app-lock")).toContain("Forgot your PIN?");
    expect(published("app-lock").includes("widget")).toBe(isPendingMet("widget_live"));
  });

  it("the app's on this day, daily reminder, offline start and month share card show", () => {
    expect(published("on-this-day")).toContain("Hide for today");
    expect(published("offline")).toContain("opens without a connection");
    expect(published("reminders")).toContain("Daily reminder");
    expect(published("share-card")).toContain("Moodbow rainbow");
    expect(published("timeline")).toContain("Share this month");
    // In 0.9.7 (7) (no 0.9.6 was ever uploaded; UX): the chart, milestone and year cards and the
    // writing prompt show too, in en and th.
    const th = (slug: string) => renderArticle(findArticle("th", slug)!);
    for (const label of ["Chart", "Milestone", "Year"]) expect(published("share-card")).toContain(`<strong>${label}</strong>`);
    for (const label of ["กราฟ", "หมุดหมาย", "ปี"]) expect(th("share-card")).toContain(`<strong>${label}</strong>`);
    expect(published("entries")).toContain("<strong>Another</strong>");
    expect(th("entries")).toContain("<strong>ข้อความอื่น</strong>");
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
  describe("the 0.9.7 features: shown by the app build people have", () => {
    // Both ways named, so these hold whether or not the id is met in
    // content/conditions.json yet (the publish-day flips just flip it).
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

  // In 0.9.7 (7) (0.9.5 was frozen, never uploaded; UX): calendar, search and the CSV line show, in en
  // and th, as the app has them; the web-only step and web import only with those switches.
  it("the app's 0.9.7: the calendar and search articles and the CSV line are published, en and th", () => {
    const th = (slug: string) => renderArticle(findArticle("th", slug)!);
    const slugs = helpIndex("en").flatMap((g) => g.articles.map((a) => a.slug));
    expect(slugs).toEqual(expect.arrayContaining(["calendar", "search"]));
    expect(published("calendar")).toContain("<strong>Calendar</strong>");
    expect(th("calendar")).toContain("<strong>ปฏิทิน</strong>");
    expect(published("search")).toContain("(or use Back)");
    expect(published("search").includes("Esc")).toBe(isPendingMet("web_journal_live"));
    expect(th("search")).toContain("(หรือใช้ปุ่มย้อนกลับ)");
    expect(th("search").includes("Esc")).toBe(isPendingMet("web_journal_live"));
    expect(published("privacy-and-data")).toContain("<strong>Spreadsheet (.csv)</strong>");
    expect(published("privacy-and-data").includes("import")).toBe(isPendingMet("import_live"));
    expect(th("privacy-and-data")).toContain("<strong>สเปรดชีต (.csv)</strong>");
  });

  // Shown by whichever comes first, the app build people have (app-*) or
  // the web's own switch ({pending:a|b}, UX 2026-11-04): Patterns (0.9.7 /
  // patterns-live) and import (0.9.7 / import-live).
  describe("Patterns and import: the app's or the web's", () => {
    const only = (on: string[], off: string[]) => (id: string) => on.includes(id) || (!off.includes(id) && isPendingMet(id));
    for (const [slug, app, web, text] of [
      ["patterns", "app_patterns", "patterns_live", "Patterns in your check-ins"],
      ["import", "app_import", "import_live", "Import from another app"],
    ] as const) {
      it(`${slug}: a 404 with neither, the same article with either`, () => {
        for (const locale of ["en", "th"]) {
          const render = (on: string[], off: string[]) => renderArticle(findArticle(locale, slug)!, only(on, off));
          expect(render([], [app, web]), `${locale} neither`).toBe("");
          expect(render([app], [web]), `${locale} app`).not.toBe("");
          expect(render([web], [app]), `${locale} web`).toBe(render([app], [web]));
        }
        expect(renderArticle(findArticle("en", slug)!, only([app], [web]))).toContain(text);
      });
    }
  });

  it("backing up's steps are a numbered list (styled in globals.css; Web Tester's regression pass)", () => {
    for (const locale of ["en", "th"]) {
      const html = renderArticle(findArticle(locale, "backing-up")!);
      expect(html, locale).toMatch(/<ol>\s*<li>/);
      expect(html.match(/<li>/g), locale).toHaveLength(4);
    }
  });

  // The web journal's lines follow web-journal-live (the web launch step
  // shows them), the AI line ai-live: these hold before and after each flip.
  it("the web journal's lines show only with the web journal, the AI line only with AI", () => {
    const web = isPendingMet("web_journal_live");
    expect(published("getting-started").includes("moodbow.com")).toBe(web);
    expect(published("getting-started").includes("on the web")).toBe(web);
    expect(published("backing-up").includes("moodbow.com")).toBe(web);
    expect(published("offline").includes("browser")).toBe(web);
    expect(published("sign-in").includes("on the web")).toBe(web);
    expect(published("reminders").includes("on the web")).toBe(web);
    expect(published("delete-account").includes("AI")).toBe(isPendingMet("ai_live"));
  });
});

// A journal with no email can't be opened again after signing out: Forgot PIN's advice
// must not reach those people without the warning (UX).
describe("Help → App lock: no email, no signing out", () => {
  it.each([
    ["en", "don't sign out"],
    ["fr", "ne vous déconnectez pas"],
    ["es", "no cierres sesión"],
    ["pt-br", "não saia da conta"],
    ["de", "melde dich nicht ab"],
    ["it", "non uscire"],
    ["th", "อย่าออกจากระบบ"],
  ])("%s", (language, warning) => {
    expect(readFileSync(`content/help/${language}/app-lock.md`, "utf8")).toContain(warning);
    // Face ID or a fingerprint still opens it, so that comes before "we can't get you back in".
    expect(readFileSync(`content/help/${language}/app-lock.md`, "utf8")).toContain("Face ID");
  });
});

// 1.3.0 ships with Plus off (decision 255): no help text may name Plus while plus is unmet, even with
// every free feature on. The Plus features' own conditions stay off with it.
describe("Help with Plus off: no article names Plus", () => {
  const PLUS_ONLY = new Set(["plus", "offer_live", "letters_live", "app_letters", "pictures_live", "app_pictures", "lifts_live", "app_icons"]);
  it.each(ALL_LOCALES)("%s", (language) => {
    for (const a of helpArticles(language)) {
      const text = renderArticle(a, (id) => !PLUS_ONLY.has(id));
      if (text.trim() === "") continue; // an article with nothing left is a 404
      // French "Plus de…" / "Plus d'…" means "more", not the product.
      expect(text, `${language}/${a.slug}`).not.toMatch(/\bPlus\b(?! de\b| d['’])/);
    }
  });
});
