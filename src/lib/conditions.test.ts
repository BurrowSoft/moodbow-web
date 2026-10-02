import { describe, expect, it } from "vitest";
import conditions from "../../content/conditions.json";
import { conditionMet, pageGate } from "./conditions";
import { liveFeatures } from "./liveFeatures";
import { BACKUP_RETENTION_DAYS } from "./site";
import { isHiddenPage, pagePath, sitemapPaths } from "./sitemapPages";
import { needsSession } from "./supabase/proxy";

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
    // Decision 44: backups are kept 7 days; the number and the flag go together.
    expect(conditionMet("backup-retention")).toBe(true);
    expect(BACKUP_RETENTION_DAYS).toBe(7);
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

describe("pagePath (what the proxy checks)", () => {
  const locales = ["en", "th"];
  it("strips the locale prefix and percent-decodes", () => {
    expect(pagePath("/privacy", locales)).toBe("/privacy");
    expect(pagePath("/en/privacy", locales)).toBe("/privacy");
    expect(pagePath("/th", locales)).toBe("/");
    expect(pagePath("/%70rivacy", locales)).toBe("/privacy");
    expect(pagePath("/en/%74erms", locales)).toBe("/terms");
  });

  it("lowercases, because Vercel matches routes case-insensitively", () => {
    expect(pagePath("/PRIVACY", locales)).toBe("/privacy");
    expect(pagePath("/En/Account-Deletion", locales)).toBe("/account-deletion");
    expect(isHiddenPage(pagePath("/Terms", locales), { vercelEnv: "production" })).toBe(true);
  });

  it("leaves malformed escapes alone", () => {
    expect(pagePath("/%E0%A4%A", locales)).toBe("/%e0%a4%a");
  });

  it("an encoded gated path is still hidden on Production", () => {
    expect(isHiddenPage(pagePath("/%70rivacy", locales), { vercelEnv: "production" })).toBe(true);
  });
});

describe("the web journal gate (W0)", () => {
  const prod = { vercelEnv: "production" };

  it("is off, and liveFeatures.webJournal follows the condition", () => {
    expect(conditionMet("web-journal-live")).toBe(false);
    expect(liveFeatures.webJournal).toBe(conditionMet("web-journal-live"));
  });

  it("hides /app and everything below it, sign-in and forgot-password on Production", () => {
    for (const path of ["/app", "/app/me", "/app/timeline", "/sign-in", "/forgot-password"]) {
      expect(isHiddenPage(path, prod), path).toBe(true);
    }
    expect(isHiddenPage("/apples", prod)).toBe(false);
    expect(isHiddenPage("/app", { vercelEnv: "preview" })).toBe(false);
  });

  it("never lists the signed-in area in the sitemap, even when live", () => {
    expect(sitemapPaths(() => true)).toEqual(["/", "/support", "/privacy", "/terms", "/account-deletion"]);
  });
});

describe("needsSession (proxy session refresh)", () => {
  it("only for the signed-in area and the auth pages", () => {
    for (const path of ["/app", "/app/me", "/sign-in", "/forgot-password", "/auth/reset-password"]) expect(needsSession(path), path).toBe(true);
    for (const path of ["/", "/support", "/privacy", "/auth/confirm", "/email-confirmed", "/apples"]) expect(needsSession(path), path).toBe(false);
  });
});
