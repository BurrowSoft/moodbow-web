// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_LOCALES } from "@/i18n/routing";
import { findArticle, renderArticle } from "./helpContent";
import { isPendingMet } from "./legalContent";

// The 1.2 features' Help articles (UX & PM, 12 Nov): each shows once the web has the feature
// (its own flag) or the app build people have does (a help-only app-* id, the decision 212
// pattern), and says only what that side does. Nothing is published while both are off.
type Row = {
  slug: string;
  app: string; // the help-only app id, as in the article (underscores)
  web: string | null; // the web flag, or null for an app-only feature
  shows: string; // en text that's there on either side
  appOnly?: string[]; // en text only the app's build brings
  webOnly?: string[]; // en text only the web brings
};

const ROWS: Row[] = [
  // The app keeps Edit, Delete and the moves in a menu per row (UX 12 Nov).
  { slug: "things-that-help", app: "app_toolbox", web: "toolbox_live", shows: "If you feel dizzy, stop and breathe normally.", appOnly: ["the menu beside each item"] },
  // The emergency line is inside the block too, so the article is never live on its own.
  {
    slug: "safety-plan",
    app: "app_safety_plan",
    web: "safety_plan_live",
    shows: "Making my surroundings safer",
    appOnly: ["Show my safety plan without unlocking", "opens without a connection"],
  },
  // The help line (UX): help when a letter is written and when it's opened.
  {
    slug: "letters",
    app: "app_letters",
    web: "letters_live",
    shows: "Moodbow shows help when you write it and when you open it.",
    appOnly: ["you also get a notification that day"],
  },
  // The web prints; the app shares a PDF.
  {
    slug: "appointment",
    app: "app_appointment",
    web: "appointment_live",
    shows: "Nothing here is saved or sent",
    appOnly: ["<strong>Share as PDF</strong>"],
    webOnly: ["<strong>Print</strong>"],
  },
];

// Every language with its own Help folder, served or not yet.
const LOCALES = [...ALL_LOCALES];
// Everything else as it really is; these two ids as the case says.
const withIds = (row: Row, app: boolean, web: boolean) => (id: string) => (id === row.app ? app : id === row.web ? web : isPendingMet(id));
const render = (locale: string, row: Row, app: boolean, web: boolean) => renderArticle(findArticle(locale, row.slug)!, withIds(row, app, web));

describe.each(ROWS)("Help: $slug (1.2)", (row) => {
  it("every language has it", () => {
    for (const locale of LOCALES) expect(findArticle(locale, row.slug), locale).not.toBeNull();
  });

  it("nothing at all while neither side has the feature: a 404, in every language", () => {
    for (const locale of LOCALES) expect(render(locale, row, false, false), locale).toBe("");
  });

  it("shows with the app's build alone, with the app's lines", () => {
    for (const locale of LOCALES) expect(render(locale, row, true, false), locale).not.toBe("");
    const html = render("en", row, true, false);
    expect(html).toContain(row.shows);
    for (const text of row.appOnly ?? []) expect(html, text).toContain(text);
    for (const text of row.webOnly ?? []) expect(html, text).not.toContain(text);
  });

  it.runIf(row.web !== null)("shows with the web's flag alone, without the app's lines", () => {
    for (const locale of LOCALES) expect(render(locale, row, false, true), locale).not.toBe("");
    const html = render("en", row, false, true);
    expect(html).toContain(row.shows);
    for (const text of row.appOnly ?? []) expect(html, text).not.toContain(text);
    for (const text of row.webOnly ?? []) expect(html, text).toContain(text);
  });

  it("as published now: a 404 exactly while both are off", () => {
    const on = isPendingMet(row.app) || (row.web !== null && isPendingMet(row.web));
    for (const locale of LOCALES) expect(renderArticle(findArticle(locale, row.slug)!) === "", locale).toBe(!on);
  });
});

// The plan link on a hard week sits on the rule-based Your week card (your-week-live), not
// the AI weekly report (Reviewer, #266).
describe("Help: safety-plan's Your week line", () => {
  it("shows only with your-week-live, in every language", () => {
    for (const locale of LOCALES) {
      const article = findArticle(locale, "safety-plan")!;
      const render = (yourWeek: boolean) => renderArticle(article, (id) => id === "safety_plan_live" || (id === "your_week_live" ? yourWeek : id === "weekly_report_live" ? true : isPendingMet(id)));
      expect(render(true), locale).not.toBe(render(false));
    }
    expect(renderArticle(findArticle("en", "safety-plan")!, (id) => id === "safety_plan_live" || id === "your_week_live")).toContain("beside it on a hard");
    expect(renderArticle(findArticle("en", "safety-plan")!, (id) => id === "safety_plan_live" || id === "weekly_report_live")).not.toContain("beside it on a hard");
  });
});
