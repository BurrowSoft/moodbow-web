// @vitest-environment node
import { describe, expect, it } from "vitest";
import { searchTerm, snippet } from "./search";

describe("searchTerm", () => {
  it("trimmed, at least 2 characters, at most 100", () => {
    expect(searchTerm("  walk ")).toBe("walk");
    expect(searchTerm("a")).toBeNull();
    expect(searchTerm("   ")).toBeNull();
    expect(searchTerm("x".repeat(101))).toBeNull();
    expect(searchTerm(42)).toBeNull();
  });
});

describe("snippet: one line around the first match", () => {
  it("the match as written, case-insensitive; cut at word boundaries with …", () => {
    const body = "It was a slow Sunday morning, so after breakfast we went for a long walk by the river and then had tea at the little cafe near the bridge before the rain started.";
    const s = snippet(body, "RIVER")!;
    expect(s.match).toBe("river");
    expect(s.before.startsWith("…")).toBe(true);
    expect(s.after.endsWith("…")).toBe(true);
    expect(`${s.before}${s.match}${s.after}`.replace(/…/g, "")).toContain("walk by the river and then");
  });

  it("short text: no ellipses; line breaks become spaces", () => {
    expect(snippet("A quiet\nwalk.", "walk")).toEqual({ before: "A quiet ", match: "walk", after: "." });
  });

  it("Thai matches as typed", () => {
    expect(snippet("วันนี้ไปเดินเล่น", "เดิน")).toEqual({ before: "วันนี้ไป", match: "เดิน", after: "เล่น" });
  });

  it("no match: null", () => {
    expect(snippet("Nothing here", "walk")).toBeNull();
  });
});
