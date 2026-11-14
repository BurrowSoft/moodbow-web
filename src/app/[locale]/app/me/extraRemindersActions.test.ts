// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Me → Daily reminder's more reminders (Plus): the server actions, with a mocked client.
// update_extra_reminders is the Mobile Dev's migration 031 (agreed shape, 12 Nov).
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn() }) }));
class Redirect {
  constructor(public args: { href: string; locale: string }) {}
}
vi.mock("@/i18n/navigation", () => ({
  redirect: (args: Redirect["args"]) => {
    throw new Redirect(args);
  },
}));
const { saveExtraReminders, saveReminder } = await import("./actions");

beforeEach(() => rpc.mockReset());

describe("saveExtraReminders", () => {
  it("sends the whole list as HH:MM and returns what the server stored", async () => {
    rpc.mockResolvedValue({ data: ["08:00:00", "20:00:00"], error: null });
    expect(await saveExtraReminders(["20:00", "08:00:00"])).toEqual({ ok: true, times: ["08:00", "20:00"] });
    expect(rpc).toHaveBeenCalledWith("update_extra_reminders", { p_times: ["20:00", "08:00"] });
  });

  it("removing everything sends an empty list", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await saveExtraReminders([])).toEqual({ ok: true, times: [] });
    expect(rpc).toHaveBeenCalledWith("update_extra_reminders", { p_times: [] });
  });

  it("refuses what isn't a time, or too many, before asking the server", async () => {
    expect(await saveExtraReminders(["8:00"])).toEqual({ ok: false, error: "invalid" });
    expect(await saveExtraReminders("08:00" as unknown as string[])).toEqual({ ok: false, error: "invalid" });
    expect(await saveExtraReminders(["08:00", "12:00", "16:00"])).toEqual({ ok: false, error: "too_many" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["too_close", "plus_required", "too_many", "invalid"] as const)("the server's %s comes back as that code", async (code) => {
    rpc.mockResolvedValue({ data: null, error: { message: code } });
    expect(await saveExtraReminders(["08:00"])).toEqual({ ok: false, error: code });
  });

  it("anything else is generic; no session goes to sign-in", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await saveExtraReminders(["08:00"])).toEqual({ ok: false, error: "generic" });
    rpc.mockResolvedValue({ data: null, error: { message: "not_authenticated" } });
    await expect(saveExtraReminders(["08:00"])).rejects.toBeInstanceOf(Redirect);
  });
});

describe("saveReminder reports the more reminders the row now has", () => {
  const form = (on: string, time: string) => {
    const f = new FormData();
    f.set("reminder_on", on);
    f.set("reminder_time", time);
    return f;
  };

  it("a new main time: the row's list after the server dropped one within the hour", async () => {
    rpc.mockResolvedValue({ data: { reminder_on: true, reminder_time: "20:00:00", extra_reminder_times: ["08:00:00"] }, error: null });
    expect(await saveReminder({ status: "idle" }, form("true", "20:00"))).toEqual({ status: "saved", on: true, time: "20:00", extra: ["08:00"] });
  });

  it("before migration 031 (no such column): nothing about extras", async () => {
    rpc.mockResolvedValue({ data: { reminder_on: true, reminder_time: "20:00:00" }, error: null });
    expect(await saveReminder({ status: "idle" }, form("true", "20:00"))).toEqual({ status: "saved", on: true, time: "20:00" });
  });
});
