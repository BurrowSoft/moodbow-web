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

  // The legal texts describe these as available today, unconditioned
  // (decisions 40 + 69: real people only arrive after M7 + M8), so neither
  // page may go live before them (Code Reviewer, #9).
  it("a live legal page needs delete account, export, Get help now and the app lock live first", () => {
    for (const { slug, gate } of PAGES) {
      if (!conditionMet(gate)) continue;
      for (const prerequisite of ["delete-account-live", "export-live", "help-now-live", "app-lock"] as const) {
        expect(conditionMet(prerequisite), `${slug} needs ${prerequisite}`).toBe(true);
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

  it("an unmet block filling a whole line removes the line (tables stay tables)", () => {
    const table = "| A | B |\n|---|---|\n| 1 | 2 |\n{pending:x}| 3 | 4 |{/pending}\n| 5 | 6 |\n";
    expect(applyPending(table, () => false).text).toBe("| A | B |\n|---|---|\n| 1 | 2 |\n| 5 | 6 |\n");
    expect(applyPending("a {pending:x}X{/pending}\nb", () => false).text).toBe("a \nb");
    // A hidden list item leaves one continuous list.
    const list = "- one\n{pending:x}- two{/pending}\n- three\n";
    expect(applyPending(list, () => false).text).toBe("- one\n- three\n");
    expect(renderLegal(`## T\n${list}`, () => false).html.match(/<ul>/g)).toHaveLength(1);
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

  it("tables survive hidden rows: §2 keeps 4 body rows, §3 keeps 5, no literal '|' lines", () => {
    const tables = page.html.split("<table>").slice(1).map((t) => t.split("</table>")[0]);
    expect(tables).toHaveLength(2);
    const bodyRows = (t: string) => (t.split("<tbody>")[1] ?? "").match(/<tr>/g)?.length ?? 0;
    expect(bodyRows(tables[0])).toBe(4);
    expect(bodyRows(tables[1])).toBe(5);
    expect(page.html.split("\n").some((line) => line.startsWith("|") || line.startsWith("<p>|"))).toBe(false);
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
