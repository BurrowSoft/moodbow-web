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
    for (const ai of [true, false]) {
      expect(await backLabel("/app", "en-US", ai)).toBe("Back to Today");
      expect(await backLabel("/app/timeline", "en-US", ai)).toBe("Back to Timeline");
      expect(await backLabel("/app/timeline/2026-10-02", "en-US", ai)).toMatch(/^Back to .*Oct.*2/);
      expect(await backLabel("/app/insights/reflections", "en-US", ai)).toBe("Back to Your reflections");
    }
  });

  // From Insights → AI (decision 258): Insights by its name for this person (UX, 27 Nov). Back has no
  // visible text, so its name says "and", never "&".
  it("Insights → AI: AI and Insights where AI is shown, Insights where it isn't", async () => {
    expect(await backLabel("/app/insights?view=ai", "en-US", true)).toBe("Back to AI and Insights");
    expect(await backLabel("/app/insights?view=ai", "en-US", false)).toBe("Back to Insights");
  });
});
