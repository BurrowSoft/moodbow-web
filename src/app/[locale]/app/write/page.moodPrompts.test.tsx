import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The write page's part of Prompts that follow your mood (1.4 E): the prompt day's check-in mood
// goes to the editor; a crisis-flagged tag that day means no prompt at all, as an entry does; a
// tags read that fails, too (fails closed). The rule itself is lib/journal/moodPrompts.
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => children }));
let tables: Record<string, { data: unknown[] | null; error: unknown }> = {};
const client = {
  auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  from: (table: string) => ({ select: () => ({ eq: async () => tables[table] ?? { data: [], error: null } }) }),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/lib/journal/me", () => ({ getMe: async () => ({ today: "2026-11-18", profile: { country: null } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({ setRequestLocale: () => {}, getTranslations: async () => (k: string) => k }));
vi.mock("@/lib/journal/backLabel", () => ({ backLabel: async () => "Back" }));
vi.mock("@/components/BackLink", () => ({ BackLink: () => null }));
vi.mock("@/components/SessionEnded", () => ({ SessionEnded: () => null }));
let plusKind: string | null = null;
vi.mock("@/lib/plus/view", () => ({ readPlusView: async () => (plusKind ? { kind: plusKind } : null) }));
let gates: Record<string, string> = {};
vi.mock("@/lib/conditions", async (orig) => ({ ...(await orig<typeof import("@/lib/conditions")>()), pageGate: (id: string) => gates[id] ?? "draft" }));
const editorProps = vi.fn();
vi.mock("../entries/EntryEditor", () => ({ EntryEditor: (p: unknown) => (editorProps(p), null) }));
const { default: WritePage } = await import("./page");
const { CRISIS_KEYWORDS } = await import("@/lib/safety/keywords");

type Props = { promptDate: string | null; moodPrompt?: { mood: number | null; plus: boolean } };
const open = async () => {
  render(await WritePage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) } as PageProps<"/[locale]/app/write">));
  return editorProps.mock.calls.at(-1)![0] as Props;
};

beforeEach(() => {
  tables = { entries: { data: [], error: null } };
  gates = {};
  plusKind = null;
  editorProps.mockClear();
});

describe("write page: prompts that follow your mood", () => {
  it("today's mood and Plus go to the editor", async () => {
    tables.check_ins = { data: [{ mood: 2 }], error: null };
    plusKind = "plus";
    const p = await open();
    expect(p.promptDate).toBe("2026-11-18");
    expect(p.moodPrompt).toEqual({ mood: 2, plus: true });
  });

  it("no check-in today, or it can't be read: no mood (the day's prompt)", async () => {
    tables.check_ins = { data: [], error: null };
    expect((await open()).moodPrompt).toEqual({ mood: null, plus: false });
    tables.check_ins = { data: null, error: { message: "boom" } };
    expect((await open()).moodPrompt).toEqual({ mood: null, plus: false });
  });

  it("a crisis-flagged tag that day: no prompt at all", async () => {
    tables.check_ins = { data: [{ mood: 4 }], error: null };
    tables.check_in_tags = { data: [{ tag: "walk" }, { tag: CRISIS_KEYWORDS!.languages.en.phrases[0] }], error: null };
    const p = await open();
    expect(p.promptDate).toBeNull();
    expect(p.moodPrompt).toBeUndefined();
  });

  it("the tags can't be read: no prompt at all (fails closed)", async () => {
    tables.check_ins = { data: [{ mood: 4 }], error: null };
    tables.check_in_tags = { data: null, error: { message: "boom" } };
    expect((await open()).promptDate).toBeNull();
  });

  it("tags off: the tags aren't read, the mood still goes", async () => {
    gates["tags-live"] = "hidden";
    tables.check_ins = { data: [{ mood: 3 }], error: null };
    tables.check_in_tags = { data: null, error: { message: "never read" } };
    const p = await open();
    expect(p.promptDate).toBe("2026-11-18");
    expect(p.moodPrompt).toEqual({ mood: 3, plus: false });
  });

  it("off (mood-prompts-live hidden): the editor gets no mood", async () => {
    gates["mood-prompts-live"] = "hidden";
    tables.check_ins = { data: [{ mood: 2 }], error: null };
    expect((await open()).moodPrompt).toBeUndefined();
  });
});
