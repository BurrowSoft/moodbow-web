// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// Insights' title names it as its tab does (UX, 27 Nov): from the server's own aiShown(me), so it's
// right in the first HTML; no client, or no `me`, means no AI word.
const lookup = (namespace: string, key: string, v?: Record<string, string>) => {
  const raw = (messages as unknown as Record<string, Record<string, string>>)[namespace][key];
  return v ? raw.replace(/\{(\w+)\}/g, (_, k) => v[k]) : raw;
};
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { locale: string; namespace: string }) => (key: string, v?: Record<string, string>) => lookup(namespace, key, v),
}));
let client: object | null = {};
let me: { ai_available?: boolean } | null = null;
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/lib/journal/me", () => ({ getMe: async () => me }));
// aiShown's own rules (the switch and ai-live) are ai.test's; here, that the title asks it.
vi.mock("@/lib/journal/ai", () => ({ aiShown: (m: { ai_available?: boolean }) => m.ai_available === true }));
const { insightsMetadata } = await import("./pageMeta");

beforeEach(() => {
  client = {};
  me = null;
});

describe("insightsMetadata", () => {
  it("AI shown: AI & Insights · Moodbow", async () => {
    me = { ai_available: true };
    expect((await insightsMetadata("en")).title).toBe("AI & Insights · Moodbow");
  });

  it("AI not shown: Insights · Moodbow", async () => {
    me = { ai_available: false };
    expect((await insightsMetadata("en")).title).toBe("Insights · Moodbow");
  });

  it("not known (no client, or no me): Insights, never the AI name", async () => {
    client = null;
    me = { ai_available: true };
    expect((await insightsMetadata("en")).title).toBe("Insights · Moodbow");
    client = {};
    me = null;
    expect((await insightsMetadata("en")).title).toBe("Insights · Moodbow");
  });

  it("never indexed", async () => {
    expect((await insightsMetadata("en")).robots).toEqual({ index: false, follow: false });
  });
});
