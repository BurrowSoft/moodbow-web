import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The write page's writing prompt (1.1 I, reviewer #83 B1): the prompt and
// its crisis check are for the day the entry starts on (?date= included).
let rows: { body: string }[] = [];
let readError: unknown = null;
const eq = vi.fn();
const client = {
  auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  from: () => ({ select: () => ({ eq: async (col: string, val: string) => (eq(col, val), { data: rows, error: readError }) }) }),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/lib/journal/me", () => ({ getMe: async () => ({ today: "2026-10-20", profile: { country: null } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({ setRequestLocale: () => {}, getTranslations: async () => (k: string) => k }));
vi.mock("@/lib/journal/backLabel", () => ({ backLabel: async () => "Back" }));
vi.mock("@/components/BackLink", () => ({ BackLink: () => null }));
let gate = "draft";
vi.mock("@/lib/conditions", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/conditions")>()), pageGate: () => gate }));
const editorProps = vi.fn();
vi.mock("../entries/EntryEditor", () => ({ EntryEditor: (p: unknown) => (editorProps(p), null) }));
const { default: WritePage } = await import("./page");

const open = async (date?: string) => {
  render(await WritePage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve(date ? { date } : {}) } as PageProps<"/[locale]/app/write">));
  return (editorProps.mock.calls.at(-1)![0] as { promptDate: string | null; startDate: string }).promptDate;
};

beforeEach(() => {
  rows = [];
  readError = null;
  gate = "draft";
  eq.mockClear();
  editorProps.mockClear();
});

describe("write page: the writing prompt's day", () => {
  it("today: checked and picked for today", async () => {
    expect(await open()).toBe("2026-10-20");
    expect(eq).toHaveBeenCalledWith("entry_date", "2026-10-20");
  });

  it("an earlier day (?date=): checked and picked for that day", async () => {
    expect(await open("2026-10-15")).toBe("2026-10-15");
    expect(eq).toHaveBeenCalledWith("entry_date", "2026-10-15");
  });

  it("an earlier entry that day is crisis-flagged: no prompt", async () => {
    rows = [{ body: "A long walk." }, { body: "Some days I want to die." }];
    expect(await open("2026-10-15")).toBeNull();
  });

  it("the check can't be read: no prompt (fails closed)", async () => {
    readError = { message: "boom" };
    expect(await open()).toBeNull();
  });

  it("prompts off: no prompt and no read", async () => {
    gate = "hidden";
    expect(await open()).toBeNull();
    expect(eq).not.toHaveBeenCalled();
  });
});
