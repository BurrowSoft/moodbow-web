// @vitest-environment node
import { describe, expect, it } from "vitest";
import { escapeLike, searchTerm, snippet } from "./search";

describe("searchTerm", () => {
  it("trimmed, at least 2 characters, at most 100", () => {
    expect(searchTerm("  walk ")).toBe("walk");
    expect(searchTerm("a")).toBeNull();
    expect(searchTerm("   ")).toBeNull();
    expect(searchTerm("x".repeat(101))).toBeNull();
    expect(searchTerm(42)).toBeNull();
  });
});

describe("escapeLike (UX: a user's % or _ is never a wildcard)", () => {
  it("escapes %, _ and the escape character itself", () => {
    expect(escapeLike("50%")).toBe("50\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("back\\slash")).toBe("back\\\\slash");
    expect(escapeLike("plain words")).toBe("plain words");
  });
});

describe("snippet: one line around the first match", () => {
  it("the match as written, case-insensitive; cut at word boundaries with …", () => {
    const body = "We went for a long walk by the river and then had tea at the little cafe near the bridge before the rain started.";
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
