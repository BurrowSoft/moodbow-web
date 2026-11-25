// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { conditionMet } from "@/lib/conditions";

// A Help article page: the article body is [data-content=article]; the link
// back to Help is chrome, after it (Web Tester, #23).
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async (ns: string) => (key: string) => `${ns}.${key}`,
}));
vi.mock("@/i18n/navigation", () => ({ Link: "a" }));
// A Preview or test build (drafts allowed) unless a test says otherwise.
const build = vi.hoisted(() => ({ gate: "draft" as "draft" | "hidden" }));
vi.mock("@/lib/conditions", async (orig) => ({ ...(await orig<typeof import("@/lib/conditions")>()), pageGate: () => build.gate }));

const { default: HelpArticlePage, generateStaticParams } = await import("./page");

// Depth-first search through a React element tree for props matching `test`.
function findProps(node: unknown, test: (p: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findProps(n, test);
      if (hit) return hit;
    }
    return undefined;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) return undefined;
  if (test(props)) return props;
  return findProps(props.children, test);
}

describe("Help article page", () => {
  it("the back link is outside the article body", async () => {
    const page = await HelpArticlePage({ params: Promise.resolve({ locale: "en", slug: "check-ins" }), searchParams: Promise.resolve({}) } as never);
    const shell = (page as { props: Record<string, unknown> }).props;
    expect(shell.article).toBe(true);
    expect(findProps(shell.children, (p) => p["data-testid"] === "help-back")).toBeUndefined();
    expect(findProps(shell.after, (p) => p["data-testid"] === "help-back")?.href).toBe("/help");
  });

  // Prerendered: the published articles only (the proxy 404s the rest: lib/helpGates.ts; e2e smoke
  // "help 404" checks the raw HTML).
  it("prerenders only the published articles", () => {
    const en = generateStaticParams().filter((p) => p.locale === "en").map((p) => p.slug);
    expect(en).toContain("check-ins");
    expect(en).toContain("get-help-now");
    // The 1.3.0 web flips (#343).
    for (const slug of ["things-that-help", "appointment", "your-week-today", "tags", "bring-this-back"]) expect(en, slug).toContain(slug);
    // The AI go-live (UX, 23 Nov) publishes ai-reflections: prerendered exactly when ai-live is met.
    expect(en.includes("ai-reflections"), "ai-reflections").toBe(conditionMet("ai-live"));
  });

  // Previews keep what they had: pending blocks follow conditions only (isPendingMet), and the one
  // draft-aware article, Bo's, follows pageGate("bo-live") as the page does (helpPageMet).
  it("Bo's article is served on a draft build (Preview) and not on Production", () => {
    const slugs = () => generateStaticParams().filter((p) => p.locale === "en").map((p) => p.slug);
    try {
      build.gate = "draft";
      expect(slugs()).toContain("bo");
      build.gate = "hidden";
      expect(slugs()).not.toContain("bo");
    } finally {
      build.gate = "draft";
    }
  });
});
