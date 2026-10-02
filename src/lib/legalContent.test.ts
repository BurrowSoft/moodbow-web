// @vitest-environment node
import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import { conditionMet, type ConditionId } from "./conditions";
import { applyPending, isPendingMet, legalSource, pendingIds, renderLegal, todos, type LegalSlug } from "./legalContent";

const PAGES: { slug: LegalSlug; gate: ConditionId }[] = [
  { slug: "privacy", gate: "privacy-text-approved" },
  { slug: "terms", gate: "terms-text-approved" },
];

describe("legal content files", () => {
  it("exist for every shipped locale (no silent fallback to English)", () => {
    for (const locale of routing.locales) {
      for (const { slug } of PAGES) expect(() => legalSource(slug, locale), `${locale}/${slug}`).not.toThrow();
    }
    expect(() => legalSource("privacy", "xx")).toThrow("Missing legal text: content/legal/xx/privacy.md");
  });

  it("every {pending:id} maps to a condition", () => {
    for (const locale of routing.locales) {
      for (const { slug } of PAGES) {
        for (const id of pendingIds(legalSource(slug, locale))) expect(() => isPendingMet(id), `${slug}: ${id}`).not.toThrow();
      }
    }
  });

  // The guard: flipping a legal page live with unconfirmed facts fails here.
  it("a live page has no ⏳ / [VITOR] left, and privacy's backup retention is confirmed", () => {
    for (const locale of routing.locales) {
      for (const { slug, gate } of PAGES) {
        if (!conditionMet(gate)) continue;
        const source = legalSource(slug, locale);
        expect(todos(source), `${locale}/${slug}`).toEqual([]);
        if (slug === "privacy") expect(conditionMet("backup-retention"), "backup-retention must be met first").toBe(true);
      }
    }
  });

  it("todos() finds every kind of to-confirm mark, but not in editor comments", () => {
    expect(todos("a ⏳(check X) b ⏳[90] c [VITOR] d ⏳ e")).toEqual(["⏳(check X)", "⏳[90]", "[VITOR]", "⏳"]);
    expect(todos("<!-- ⏳ and [VITOR] mark facts -->\nclean text")).toEqual([]);
  });

  it("the current drafts have no to-confirm marks left (UX decision 67)", () => {
    for (const { slug } of PAGES) expect(todos(legalSource(slug, "en")), slug).toEqual([]);
  });
});

describe("applyPending", () => {
  it("removes unmet blocks and keeps met ones, inline or block", () => {
    const src = "a {pending:x}X{/pending} b {pending:y}Y{/pending} c";
    expect(applyPending(src, (id) => id === "y")).toEqual({ text: "a  b Y c", hidden: [{ id: "x", text: "X" }] });
  });

  it("handles nesting: an unmet outer hides the inner; a met outer keeps only met inners", () => {
    const src = "{pending:outer}O1 {pending:inner}I{/pending} O2{/pending}";
    expect(applyPending(src, () => false).text).toBe("");
    expect(applyPending(src, (id) => id === "outer").text).toBe("O1  O2");
    expect(applyPending(src, () => true).text).toBe("O1 I O2");
  });
});

describe("renderLegal (the real privacy text, nothing met)", () => {
  const page = renderLegal(legalSource("privacy", "en"), () => false);

  it("takes the title from the first ## line and moves sections up a level", () => {
    expect(page.title).toBe("Moodbow Privacy Policy");
    expect(page.html).not.toContain("Moodbow Privacy Policy");
    expect(page.html).toContain("<h2>The short version</h2>");
    expect(page.html).not.toContain("<h3>");
  });

  it("renders the tables and strips the source comment", () => {
    expect(page.html).toContain("<table>");
    expect(page.html).toContain("Supabase (on Amazon Web Services)");
    expect(page.html).not.toContain("Source: specs/");
  });

  it("drops unmet pending blocks exactly as Production would, and lists them", () => {
    expect(page.html).not.toContain("Google Play, Apple App Store");
    expect(page.html).not.toContain("What Moodbow remembers");
    expect(page.html).not.toContain("{pending");
    expect(page.hidden.map((h) => h.id)).toEqual(expect.arrayContaining(["purchases", "ai_memory", "backup_retention", "app_lock", "share_cards"]));
  });

  it("highlights facts still to confirm (if any come back)", () => {
    expect(renderLegal("## T\nSee ⏳[90] days.", () => false).html).toContain('<mark class="legal-todo">⏳[90]</mark>');
  });

  it("terms: AI and credit sections stay out until live", () => {
    const terms = renderLegal(legalSource("terms", "en"), () => false);
    expect(terms.title).toBe("Moodbow Terms of Use");
    expect(terms.html).not.toContain("AI features");
    expect(terms.html).not.toContain("AI credits");
    expect(terms.html).toContain("<strong>not</strong> medical care");
  });
});
