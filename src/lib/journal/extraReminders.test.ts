// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_LOCALES } from "@/i18n/routing";
import { findArticle, renderArticle } from "@/lib/helpContent";
import { isPendingMet } from "@/lib/legalContent";
import { extraReminders } from "@/lib/plus/view";
import { checkExtraTimes, EXTRA_REMINDERS, extraReminderError, gapMinutes, parseExtraTimes, removedTimes, toHHMM } from "./extraReminders";

// specs/plus-more-reminders.md (UX 12 Nov): 3 a day (2 more), an hour apart, the server's codes.
describe("more reminders: the rules the server enforces", () => {
  it("the contract's numbers", () => {
    expect(EXTRA_REMINDERS.maxExtra).toBe(2);
    expect(EXTRA_REMINDERS.minGapMinutes).toBe(60);
    expect(EXTRA_REMINDERS.errors).toEqual(["invalid", "too_many", "plus_required", "too_close"]);
  });

  it("times: HH:MM from either form, nothing else", () => {
    expect(toHHMM("07:05")).toBe("07:05");
    expect(toHHMM("21:00:00")).toBe("21:00");
    for (const bad of ["24:00", "7:05", "07:60", "", null, 7]) expect(toHHMM(bad), String(bad)).toBeNull();
    expect(parseExtraTimes(["21:30:00", "08:00:00", "08:00", "nope"])).toEqual(["08:00", "21:30"]);
    expect(parseExtraTimes(undefined)).toEqual([]);
  });

  it("the gap goes the short way round midnight", () => {
    expect(gapMinutes("23:30", "00:10")).toBe(40);
    expect(gapMinutes("08:00", "09:00")).toBe(60);
    expect(gapMinutes("00:00", "12:00")).toBe(720);
  });

  it("checks: invalid, then too many, then too close; an hour exactly is fine", () => {
    expect(checkExtraTimes(["8:00"], "21:00")).toBe("invalid");
    expect(checkExtraTimes(["08:00", "12:00", "16:00"], "21:00")).toBe("too_many");
    expect(checkExtraTimes(["20:30"], "21:00")).toBe("too_close");
    expect(checkExtraTimes(["08:00", "08:45"], "21:00")).toBe("too_close");
    expect(checkExtraTimes(["00:10"], "23:30")).toBe("too_close");
    expect(checkExtraTimes(["08:00", "20:00"], "21:00")).toBeNull();
    expect(checkExtraTimes([], "21:00")).toBeNull();
  });

  it("which a new main time removed; the server's message as a code", () => {
    expect(removedTimes(["08:00", "20:30"], ["08:00"])).toEqual(["20:30"]);
    expect(removedTimes(["08:00"], ["08:00"])).toEqual([]);
    expect(extraReminderError('P0001: too_close')).toBe("too_close");
    expect(extraReminderError("plus_required")).toBe("plus_required");
    expect(extraReminderError("something else")).toBe("generic");
    expect(extraReminderError(undefined)).toBe("generic");
  });
});

describe("more reminders on Me: what each person sees", () => {
  it("nothing at all where Plus isn't shown (flag off, row unreadable), not even kept times", () => {
    expect(extraReminders(null, ["08:00:00"], "US$59.99")).toBeNull();
  });

  it("with Plus: editable, with the stored times", () => {
    expect(extraReminders({ kind: "plus", source: "stripe", daysLeft: null }, ["20:00:00", "08:00:00"], "US$59.99")).toEqual({ mode: { kind: "plus" }, times: ["08:00", "20:00"] });
  });

  it("without Plus: locked, kept times still listed (nothing deleted), the trial offered only if unused", () => {
    expect(extraReminders({ kind: "free", trial: true }, ["08:00:00"], "US$59.99")).toEqual({ mode: { kind: "locked", offer: { trial: true, price: "US$59.99" } }, times: ["08:00"] });
    expect(extraReminders({ kind: "free", trial: false }, [], "P")).toEqual({ mode: { kind: "locked", offer: { trial: false, price: "P" } }, times: [] });
    expect(extraReminders({ kind: "past_due" }, undefined, "P")).toEqual({ mode: { kind: "locked", offer: { trial: false, price: "P" } }, times: [] });
  });
});

describe("Help → Daily reminders: the Plus line only with Plus", () => {
  it.each([...ALL_LOCALES])("%s", (locale) => {
    const article = findArticle(locale, "reminders")!;
    const render = (plus: boolean) => renderArticle(article, (id) => (id === "plus" ? plus : id === "app_reminders" ? true : isPendingMet(id)));
    expect(render(true)).not.toBe(render(false));
    expect(render(true).length).toBeGreaterThan(render(false).length);
  });

  it("en: names the button and the after-check-in rule", () => {
    const html = renderArticle(findArticle("en", "reminders")!, (id) => id === "plus" || id === "app_reminders");
    expect(html).toContain("<strong>Add another time</strong>");
    expect(html).toContain("After you check in");
    expect(readFileSync("src/messages/en.json", "utf8")).toContain('"reminderAddTime": "Add another time"');
  });
});
