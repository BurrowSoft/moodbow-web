import { describe, expect, it } from "vitest";
import { previewToday, previewTodayQuery } from "./previewToday";

const PROD = { vercelEnv: "production", nodeEnv: "production", showDrafts: "1" };
const PREVIEW = { vercelEnv: "preview", nodeEnv: "production", showDrafts: undefined };
const TODAY = "2026-11-18";

describe("previewToday", () => {
  it("Production never reads it, even with SHOW_DRAFTS", () => {
    expect(previewToday("2026-12-05", TODAY, PROD)).toBe(TODAY);
  });

  it("a Preview takes a real date", () => {
    expect(previewToday("2026-12-05", TODAY, PREVIEW)).toBe("2026-12-05");
    expect(previewToday(["2027-01-10", "2026-12-05"], TODAY, PREVIEW)).toBe("2027-01-10");
  });

  it("anything else is ignored", () => {
    for (const bad of [undefined, "", "2026-13-01", "2026-02-30", "2026-12-5", "tomorrow", "2026-12-05T00:00", 20261205]) {
      expect(previewToday(bad, TODAY, PREVIEW)).toBe(TODAY);
    }
  });

  it("the query is carried only when in use", () => {
    expect(previewTodayQuery(TODAY, TODAY)).toBe("");
    expect(previewTodayQuery("2026-12-05", TODAY)).toBe("?today=2026-12-05");
  });
});
