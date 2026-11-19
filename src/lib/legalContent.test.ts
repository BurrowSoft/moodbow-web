// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_LOCALES, routing } from "@/i18n/routing";
import messages from "@/messages/en.json";
import thMessages from "@/messages/th.json";
import { conditionMet, type ConditionId } from "./conditions";
import { applyPending, isPendingMet, legalLocale, legalSource, pendingIds, renderLegal, scrollableTables, todos, type LegalSlug } from "./legalContent";
import { BACKUP_RETENTION_DAYS } from "./site";

const PAGES: { slug: LegalSlug; gate: ConditionId }[] = [
  { slug: "privacy", gate: "privacy-text-approved" },
  { slug: "terms", gate: "terms-text-approved" },
  { slug: "consumer-health-data", gate: "consumer-health-data-approved" },
];

describe("Spanish, page by page, behind its approval", () => {
  it("privacy and terms: Spanish once approved, or as a draft on a test build; English on Production until then", () => {
    for (const slug of ["privacy", "terms"] as const) {
      expect(legalLocale("es", slug, () => "live")).toBe("es");
      expect(legalLocale("es", slug, () => "draft")).toBe("es");
      expect(legalLocale("es", slug, () => "hidden")).toBe("en");
    }
  });
  it("Consumer Health Data stays English, approved or not", () => {
    expect(legalLocale("es", "consumer-health-data", () => "live")).toBe("en");
  });
  it("other languages aren't touched by it", () => {
    for (const locale of ["fr", "pt-br", "de", "it", "th"]) expect(legalLocale(locale, "privacy", () => "live")).toBe("en");
  });
  it("still off on Production: Vitor approves, and his word flips it", () => {
    expect(conditionMet("legal-es-approved")).toBe(false);
  });
});

describe("legal content files", () => {
  it("exist for every locale's text language; never a silent fallback", () => {
    for (const locale of [...routing.locales, ...ALL_LOCALES]) {
      for (const { slug } of PAGES) expect(() => legalSource(slug, legalLocale(locale, slug)), `${locale}/${slug}`).not.toThrow();
    }
    expect(() => legalSource("privacy", "xx")).toThrow("Missing legal text: content/legal/xx/privacy.md");
  });

  it("Thai pages show the English text, said so on the page (legalEnglishOnly, 1.1 F)", () => {
    expect(legalLocale("en", "privacy")).toBe("en");
    expect(legalLocale("th", "privacy")).toBe("en");
    expect(messages.legal.legalEnglishOnly).toBe("This page is available in English.");
    expect(thMessages.legal.legalEnglishOnly).toBe("หน้านี้มีให้อ่านเป็นภาษาอังกฤษ");
  });

  it("every {pending:id} maps to a condition", () => {
    for (const locale of routing.locales) {
      for (const { slug } of PAGES) {
        for (const id of pendingIds(legalSource(slug, legalLocale(locale, slug)))) expect(() => isPendingMet(id), `${slug}: ${id}`).not.toThrow();
      }
    }
  });

  // The guard: flipping a legal page live with unconfirmed facts fails here.
  it("a live page has no ⏳ / [VITOR] left, and privacy's backup retention is confirmed", () => {
    for (const locale of routing.locales) {
      for (const { slug, gate } of PAGES) {
        if (!conditionMet(gate)) continue;
        const source = legalSource(slug, legalLocale(locale, slug));
        expect(todos(source), `${locale}/${slug}`).toEqual([]);
        if (slug === "privacy") expect(conditionMet("backup-retention"), "backup-retention must be met first").toBe(true);
      }
    }
  });

  // The legal texts describe these as available today, unconditioned
  // (decisions 40 + 69: real people only arrive after M7 + M8), so neither
  // page may go live before them (Code Reviewer, #9). The app lock is not a
  // prerequisite: its clause is wrapped in {pending:app_app_lock}, met once
  // the app build people have includes it (decisions 188, 212).
  it("a live legal page needs delete account, export and Get help now live first", () => {
    for (const { slug, gate } of PAGES) {
      if (!conditionMet(gate)) continue;
      for (const prerequisite of ["delete-account-live", "export-live", "help-now-live"] as const) {
        expect(conditionMet(prerequisite), `${slug} needs ${prerequisite}`).toBe(true);
      }
    }
  });

  // Text = enforcement (decision 84): the policy's backup window is the
  // number the account-deletion page uses.
  it("the privacy policy's backup days match BACKUP_RETENTION_DAYS", () => {
    for (const locale of routing.locales) {
      const days = legalSource("privacy", legalLocale(locale, "privacy")).match(/\{pending:backup_retention\}(\d+)\{\/pending\}/)?.[1];
      expect(Number(days), locale).toBe(BACKUP_RETENTION_DAYS);
    }
  });

  // Decision 216: Vitor's anonymous-start paragraph goes live only with the
  // app release that starts without an email (anon-start-live).
  it("the 'without an email' paragraph shows only once anon-start-live is met", () => {
    const source = legalSource("privacy", "en");
    const heading = "Using Moodbow without an email:";
    const met = (on: boolean) => (id: string) => (id === "anon_start_live" ? on : isPendingMet(id));
    expect(renderLegal(source, met(false)).html).not.toContain(heading);
    expect(renderLegal(source, met(true)).html.split(heading)).toHaveLength(2);
    expect(renderLegal(source).html.includes(heading)).toBe(conditionMet("anon-start-live"));
  });

  it("a journal with no email: the policy says it can be lost and can't be returned, only once that start is live", () => {
    const source = readFileSync(path.join(process.cwd(), "content/legal/en/privacy.md"), "utf8");
    const met = (on: boolean) => (id: string) => (id === "anon_start_live" ? on : isPendingMet(id));
    expect(renderLegal(source, met(true)).html).toContain("sign-in can open your journal");
    expect(renderLegal(source, met(false)).html).not.toContain("sign-in can open your journal");
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

  // A Help article about a feature in the app OR on the web (UX 2026-11-04).
  it("{pending:a|b} shows when either is met, and goes only when neither is", () => {
    const src = "x {pending:app_y|web_y}Y {pending:z}Z{/pending}{/pending} w";
    expect(applyPending(src, (id) => id === "app_y" || id === "z").text).toBe("x Y Z w");
    expect(applyPending(src, (id) => id === "web_y").text).toBe("x Y  w");
    expect(applyPending(src, () => false)).toEqual({ text: "x  w", hidden: [{ id: "z", text: "Z" }, { id: "app_y|web_y", text: "Y" }] });
    // The ids named, each alternative on its own (so each is checked as a condition).
    expect(pendingIds(src)).toEqual(["app_y", "web_y", "z"]);
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

  // axe scrollable-region-focusable at 390 px (Web Tester): each table's
  // sideways scroller is a focusable region named by its section.
  it("each table scrolls in a keyboard-reachable region named by its section", () => {
    const regions = [...page.html.matchAll(/<div class="table-scroll" role="region" tabindex="0" aria-label="([^"]*)"><table>/g)].map((m) => m[1]);
    expect(regions).toEqual(["2. Why we use it, and on what legal basis", "3. Who processes your data for us"]);
    expect(page.html.match(/<table>/g)).toHaveLength(2);
    expect(page.html.match(/<\/table><\/div>/g)).toHaveLength(2);
  });

  it("the wrapper is markup only: taking it off gives back exactly what marked rendered", () => {
    const html = "<h2>Who &amp; why</h2>\n<p>Text</p>\n<table>\n<tr><td>1</td></tr>\n</table>\n<p>After</p>\n";
    const wrapped = scrollableTables(html);
    expect(wrapped).toContain('<div class="table-scroll" role="region" tabindex="0" aria-label="Who &amp; why"><table>');
    expect(wrapped.replace(/<div class="table-scroll"[^>]*>/g, "").replace(/<\/table><\/div>/g, "</table>")).toBe(html);
    // No section before it: a plain name.
    expect(scrollableTables("<table></table>")).toBe('<div class="table-scroll" role="region" tabindex="0" aria-label="Table"><table></table></div>');
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
    expect(page.hidden.map((h) => h.id)).toEqual(expect.arrayContaining(["purchases", "ai_memory", "backup_retention", "app_app_lock", "app_share_cards"]));
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
