// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// A Help article page: the article body is [data-content=article]; the link
// back to Help is chrome, after it (Web Tester, #23).
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async (ns: string) => (key: string) => `${ns}.${key}`,
}));
vi.mock("@/i18n/navigation", () => ({ Link: "a" }));
vi.mock("@/lib/conditions", async (orig) => ({ ...(await orig<typeof import("@/lib/conditions")>()), pageGate: () => "draft" }));

const { default: HelpArticlePage } = await import("./page");

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
    const page = await HelpArticlePage({ params: Promise.resolve({ locale: "en", slug: "check-ins" }) } as never);
    const shell = (page as { props: Record<string, unknown> }).props;
    expect(shell.article).toBe(true);
    expect(findProps(shell.children, (p) => p["data-testid"] === "help-back")).toBeUndefined();
    expect(findProps(shell.after, (p) => p["data-testid"] === "help-back")?.href).toBe("/help");
  });
});
