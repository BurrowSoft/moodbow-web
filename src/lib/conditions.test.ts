import { describe, expect, it } from "vitest";
import conditions from "../../content/conditions.json";
import { conditionMet, pageGate } from "./conditions";
import { liveFeatures } from "./liveFeatures";
import { BACKUP_RETENTION_DAYS } from "./site";
import { sitemapPaths } from "./sitemapPages";

describe("conditions", () => {
  it("every entry has a boolean met and a description", () => {
    for (const [id, c] of Object.entries(conditions)) {
      expect(typeof c.met, id).toBe("boolean");
      expect(c.what.length, id).toBeGreaterThan(20);
    }
  });

  // Pinned: flipping any of these is its own reviewed PR (text = enforcement).
  it("nothing is live yet", () => {
    expect(conditionMet("privacy-text-approved")).toBe(false);
    expect(conditionMet("terms-text-approved")).toBe(false);
    expect(conditionMet("delete-account-live")).toBe(false);
    expect(conditionMet("backup-retention-confirmed")).toBe(false);
    expect(BACKUP_RETENTION_DAYS).toBeNull();
    expect(liveFeatures.webJournal).toBe(false);
  });
});

describe("pageGate", () => {
  it("unmet pages are 404 on Production", () => {
    expect(pageGate("privacy-text-approved", "production")).toBe("hidden");
  });

  it("unmet pages are drafts on Preview, locally and in CI", () => {
    expect(pageGate("privacy-text-approved", "preview")).toBe("draft");
    expect(pageGate("privacy-text-approved", "development")).toBe("draft");
    expect(pageGate("privacy-text-approved", undefined)).toBe("draft");
  });
});

describe("sitemapPaths", () => {
  it("lists only ungated pages while nothing is met", () => {
    expect(sitemapPaths()).toEqual(["/", "/support"]);
  });

  it("adds a gated page once its condition is met", () => {
    expect(sitemapPaths((id) => id === "delete-account-live")).toEqual(["/", "/support", "/account-deletion"]);
  });
});
