import { describe, expect, it } from "vitest";
import conditions from "../../content/conditions.json";
import { conditionMet, pageGate } from "./conditions";
import { liveFeatures } from "./liveFeatures";
import { BACKUP_RETENTION_DAYS } from "./site";
import { isHiddenPage, sitemapPaths } from "./sitemapPages";

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

describe("pageGate (fails closed)", () => {
  const gate = (build: Parameters<typeof pageGate>[1]) => pageGate("privacy-text-approved", build);

  it("unmet pages are 404 on Production, even with the drafts flag or in dev mode", () => {
    expect(gate({ vercelEnv: "production" })).toBe("hidden");
    expect(gate({ vercelEnv: "production", showDrafts: "1", nodeEnv: "development" })).toBe("hidden");
  });

  it("unmet pages are 404 when the environment is unset or unknown", () => {
    expect(gate({})).toBe("hidden");
    expect(gate({ nodeEnv: "production" })).toBe("hidden");
    expect(gate({ vercelEnv: "staging" })).toBe("hidden");
    expect(gate({ showDrafts: "true" })).toBe("hidden");
  });

  it("unmet pages are drafts only on known test builds", () => {
    expect(gate({ vercelEnv: "preview" })).toBe("draft");
    expect(gate({ vercelEnv: "development" })).toBe("draft");
    expect(gate({ nodeEnv: "development" })).toBe("draft");
    expect(gate({ nodeEnv: "production", showDrafts: "1" })).toBe("draft");
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

describe("isHiddenPage (the proxy's routing-level 404)", () => {
  const prod = { vercelEnv: "production" };
  const preview = { vercelEnv: "preview" };

  it("hides unmet gated pages on Production, with or without a trailing slash", () => {
    for (const path of ["/privacy", "/terms", "/account-deletion", "/privacy/"]) {
      expect(isHiddenPage(path, prod), path).toBe(true);
    }
  });

  it("never hides ungated or unknown paths, and shows drafts on test builds", () => {
    for (const path of ["/", "/support", "/email-confirmed", "/no-such-page"]) {
      expect(isHiddenPage(path, prod), path).toBe(false);
    }
    expect(isHiddenPage("/privacy", preview)).toBe(false);
  });

  it("fails closed when the environment is unset", () => {
    expect(isHiddenPage("/privacy", {})).toBe(true);
  });
});
