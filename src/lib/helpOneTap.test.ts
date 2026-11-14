// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ALL_LOCALES } from "@/i18n/routing";
import { findArticle, renderArticle } from "./helpContent";
import { isPendingMet } from "./legalContent";

// One-tap check-in (1.2 §5, UX & PM 12 Nov): app only, so its Help article shows only once the
// app build people have has it (app-quick-checkin, help-only); a 404 before, in every language.
const withQuick = (on: boolean) => (id: string) => (id === "app_quick_checkin" ? on : isPendingMet(id));
const render = (locale: string, on: boolean) => renderArticle(findArticle(locale, "one-tap-check-in")!, withQuick(on));

describe("Help: one-tap-check-in (1.2)", () => {
  it("every language has it, and nothing is published while the app build hasn't it", () => {
    for (const locale of ALL_LOCALES) {
      expect(findArticle(locale, "one-tap-check-in"), locale).not.toBeNull();
      expect(render(locale, false), locale).toBe("");
      expect(render(locale, true), locale).not.toBe("");
    }
  });

  it("with it: the sheet, Saved and Undo, and that it's app only", () => {
    const html = render("en", true);
    for (const text of ["<strong>How are you today?</strong>", "<strong>Undo</strong>", "5 seconds", "only in the app"]) expect(html, text).toContain(text);
  });

  it("as published now: a 404 exactly while app-quick-checkin is off", () => {
    expect(renderArticle(findArticle("en", "one-tap-check-in")!) === "").toBe(!isPendingMet("app_quick_checkin"));
  });
});
