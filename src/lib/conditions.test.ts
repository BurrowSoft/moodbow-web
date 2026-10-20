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

  // A flip that depends on another: the keyboard shortcuts' Help article
  // (1.1 O) mentions "/" for search without its own gate, so shortcuts-live
  // never goes live before search-live (UX).
  it("shortcuts-live only once search-live is met", () => {
    const met = (id: string) => (conditions as Record<string, { met: boolean }>)[id]?.met === true;
    expect(!met("shortcuts-live") || met("search-live")).toBe(true);
  });

  // Pinned: flipping any of these is its own reviewed PR (text = enforcement).
  // Live since the first closed-test build with M7 + M8 (Vitor, decisions 162 + 164): the legal pages, account
  // deletion, export and the help card (app side; the web side comes with the web journal).
  it("what's live: the legal pages and the app's delete / export / help card", () => {
    for (const id of ["privacy-text-approved", "terms-text-approved", "delete-account-live", "export-live", "help-now-live"] as const) {
      expect(conditionMet(id), id).toBe(true);
    }
    // Decisions 44 + 84: backups are kept 8 days; the number and the flag go together.
    expect(conditionMet("backup-retention")).toBe(true);
    expect(BACKUP_RETENTION_DAYS).toBe(8);
  });

  // The web launch step (next-release.md, "Help flips with the product"):
  // the journal and the features its Help describes go live together.
  // Never before the Privacy Policy and Terms are live (decisions 40 + 82):
  // sign-up opens with this step, so this stays red until the legal flip
  // is on master (reviewer #100 B1).
  it("the web launch flips as one step, after the legal pages", () => {
    expect(conditionMet("privacy-text-approved"), "privacy-text-approved").toBe(true);
    expect(conditionMet("terms-text-approved"), "terms-text-approved").toBe(true);
    expect(liveFeatures.webJournal).toBe(true);
    for (const id of ["web-journal-live", "share-cards", "help-now-live", "export-live", "delete-account-live"] as const) {
      expect(conditionMet(id), id).toBe(true);
    }
  });
});

describe("pageGate (fails closed)", () => {
  // An unmet gate (the legal pages are live now).
  const gate = (build: Parameters<typeof pageGate>[1]) => pageGate("web-journal-live", build);

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
  it("after the web launch: the ungated pages, Help and account deletion (not the legal pages yet)", () => {
    expect(sitemapPaths()).toEqual(["/", "/support", "/help", "/account-deletion"]);
  });

  it("adds a gated page once its condition is met", () => {
    expect(sitemapPaths((id) => id === "delete-account-live")).toEqual(["/", "/support", "/account-deletion"]);
  });
});

describe("isHiddenPage (the proxy's routing-level 404)", () => {
  const prod = { vercelEnv: "production" };
  const preview = { vercelEnv: "preview" };

  it("hides unmet gated pages on Production, with or without a trailing slash", () => {
    for (const path of ["/privacy", "/terms", "/privacy/"]) {
      expect(isHiddenPage(path, prod), path).toBe(true);
    }
    // Live with the web launch.
    expect(isHiddenPage("/account-deletion", prod)).toBe(false);
  });

  it("met gated pages are live on Production (the legal pages, account deletion, Help: decision 212)", () => {
    for (const path of ["/privacy", "/terms", "/account-deletion", "/privacy/", "/help", "/help/", "/help/check-ins"]) {
      expect(isHiddenPage(path, prod), path).toBe(false);
    }
  });

  it("never hides ungated or unknown paths, and shows drafts on test builds", () => {
    for (const path of ["/", "/support", "/email-confirmed", "/no-such-page"]) {
      expect(isHiddenPage(path, prod), path).toBe(false);
    }
    expect(isHiddenPage("/sign-in", preview)).toBe(false);
  });

  it("fails closed when the environment is unset", () => {
    expect(isHiddenPage("/sign-in", {})).toBe(true);
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
    expect(isHiddenPage(pagePath("/Sign-In", locales), { vercelEnv: "production" })).toBe(true);
  });

  it("leaves malformed escapes alone", () => {
    expect(pagePath("/%E0%A4%A", locales)).toBe("/%e0%a4%a");
  });

  it("an encoded gated path is still hidden on Production", () => {
    expect(isHiddenPage(pagePath("/%73ign-in", locales), { vercelEnv: "production" })).toBe(true);
  });
});

describe("the web journal gate (W0)", () => {
  const prod = { vercelEnv: "production" };

  it("is on, and liveFeatures.webJournal follows the condition", () => {
    expect(conditionMet("web-journal-live")).toBe(true);
    expect(liveFeatures.webJournal).toBe(conditionMet("web-journal-live"));
  });

  it("shows /app and everything below it, sign-in and forgot-password on Production", () => {
    for (const path of ["/app", "/app/me", "/app/timeline", "/sign-in", "/forgot-password"]) {
      expect(isHiddenPage(path, prod), path).toBe(false);
    }
    expect(isHiddenPage("/apples", prod)).toBe(false);
  });

  it("never lists the signed-in area in the sitemap, even when live", () => {
    expect(sitemapPaths(() => true)).toEqual(["/", "/support", "/help", "/privacy", "/terms", "/account-deletion"]);
  });
});

describe("needsSession (proxy session refresh)", () => {
  it("only for the signed-in area and the auth pages", () => {
    for (const path of ["/app", "/app/me", "/sign-in", "/forgot-password", "/auth/reset-password"]) expect(needsSession(path), path).toBe(true);
    for (const path of ["/", "/support", "/privacy", "/auth/confirm", "/email-confirmed", "/apples"]) expect(needsSession(path), path).toBe(false);
  });
});
