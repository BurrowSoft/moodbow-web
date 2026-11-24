// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: "app" | "ai") => (key: string, v?: Record<string, string>) => {
    const raw = (messages as unknown as Record<string, Record<string, string>>)[ns][key];
    return v ? raw.replace(/\{(\w+)\}/g, (_, k) => v[k]) : raw;
  },
}));
const { backLabel } = await import("./backLabel");

describe("backLabel (navBackTo, decision 152)", () => {
  it("names the screen Back returns to", async () => {
    expect(await backLabel("/app", "en-US")).toBe("Back to Today");
    expect(await backLabel("/app/timeline", "en-US")).toBe("Back to Timeline");
    expect(await backLabel("/app/timeline/2026-10-02", "en-US")).toMatch(/^Back to .*Oct.*2/);
    // From Insights → AI and from See all (decision 258).
    expect(await backLabel("/app/insights?view=ai", "en-US")).toBe("Back to Insights");
    expect(await backLabel("/app/insights/reflections", "en-US")).toBe("Back to Your reflections");
  });
});
