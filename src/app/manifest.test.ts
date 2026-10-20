// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The web app manifest names the Play app only once its listing is live
// (play-live, decision 185), and never prefers it over the web journal.
let met: string[] = [];
vi.mock("@/lib/conditions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conditions")>()),
  conditionMet: (id: string) => met.includes(id),
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
const { default: manifest } = await import("./manifest");

beforeEach(() => {
  met = [];
});

describe("manifest", () => {
  it("before the Play listing: no related applications", async () => {
    const m = await manifest();
    expect(m.related_applications).toBeUndefined();
    expect(m.prefer_related_applications).toBeUndefined();
  });

  it("play-live: the Play app, not preferred", async () => {
    met = ["play-live"];
    const m = await manifest();
    expect(m.related_applications).toEqual([{ platform: "play", url: "https://play.google.com/store/apps/details?id=com.burrowsoft.moodbow", id: "com.burrowsoft.moodbow" }]);
    expect(m.prefer_related_applications).toBe(false);
  });
});
