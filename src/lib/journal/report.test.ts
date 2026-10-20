// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isCrisis, lastWeekStart, parseReportBody, reportOutcome } from "./report";

describe("lastWeekStart: the Monday of the last complete week", () => {
  it.each([
    ["2026-10-19", "2026-10-12"], // a Monday: last week, not this one
    ["2026-10-20", "2026-10-12"],
    ["2026-10-25", "2026-10-12"], // a Sunday: this week isn't complete yet
    ["2026-10-26", "2026-10-19"],
    ["2026-01-01", "2025-12-22"], // across a year
    ["2024-03-04", "2024-02-26"], // across a leap February
    // The server's own cases (moodbow-app report/prompt_test.ts).
    ["2026-10-18", "2026-10-05"],
    ["2027-01-01", "2026-12-21"],
  ])("%s → %s", (today, monday) => {
    expect(lastWeekStart(today)).toBe(monday);
  });
});

describe("parseReportBody", () => {
  const sections = { changed: "You slept about an hour more.", went_well: "The Tuesday walk.", notice: "Busier days came after short nights.", idea: "An earlier night before Thursday." };

  it("the four sections; idea is optional", () => {
    expect(parseReportBody({ sections })).toEqual({ sections });
    const { idea: _idea, ...three } = sections;
    void _idea;
    expect(parseReportBody({ sections: three })).toEqual({ sections: three });
    expect(parseReportBody({ sections: { ...three, idea: "  " } })).toEqual({ sections: three });
  });

  it("the crisis shape, alone", () => {
    const body = parseReportBody({ crisis: "Please reach out now." });
    expect(body).toEqual({ crisis: "Please reach out now." });
    expect(isCrisis(body!)).toBe(true);
  });

  it("accepts a JSON string (a text column)", () => {
    expect(parseReportBody(JSON.stringify({ sections }))).toEqual({ sections });
  });

  it("anything else: null (no half reports)", () => {
    expect(parseReportBody(null)).toBeNull();
    expect(parseReportBody("not json")).toBeNull();
    expect(parseReportBody({ sections: { changed: "x", went_well: "y" } })).toBeNull();
    expect(parseReportBody({ crisis: "" })).toBeNull();
  });
});

describe("reportOutcome (report.md, Errors)", () => {
  it.each([
    ["in_progress", { status: "in_progress" }],
    ["ai_disabled", { status: "hidden" }],
    ["not_enough", { status: "error", message: "reportNotEnough" }],
    ["ai_consent_required", { status: "error", message: "meAiOffHint" }],
    ["rate_limited", { status: "error", message: "errRateLimited" }],
    ["daily_limit", { status: "error", message: "dailyLimit" }],
    ["report_failed", { status: "error", message: "reportError" }],
    ["invalid_value", { status: "error", message: "reportError" }],
    ["ai_budget_exhausted", { status: "error", message: "reportError" }],
    ["something_new", { status: "error", message: "reportError" }],
  ])("%s", (code, outcome) => {
    expect(reportOutcome(code)).toEqual(outcome);
  });
});
