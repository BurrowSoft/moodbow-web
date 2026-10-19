// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportFileName } from "@/lib/journal/account";

// Me's Your data actions with a mocked Supabase client.
const rpc = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc, auth: { getUser, signOut } }) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
const setCookie = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ set: setCookie }) }));
class Redirect {
  constructor(public args: { href: string; locale: string }) {}
}
vi.mock("@/i18n/navigation", () => ({
  redirect: (args: Redirect["args"]) => {
    throw new Redirect(args);
  },
}));
const { exportMyData, deleteMyAccount, saveReminder, setAiEnabled, recordAiWithdrawal, saveTone, saveFocusAreas, saveRegion } = await import("./actions");

const UID = "0b5f2c1e-7d3a-4e8b-9c41-2a6f8e1d3b70";
const confirm = (word: string) => {
  const f = new FormData();
  f.set("confirm", word);
  return f;
};
const idle = { status: "idle" } as const;

beforeEach(() => {
  rpc.mockReset();
  getUser.mockReset();
  signOut.mockReset();
  setCookie.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null });
  signOut.mockResolvedValue({ error: null });
});

describe("exportMyData", () => {
  it("returns export_my_data() as pretty JSON with its day", async () => {
    const doc = { format: "moodbow-export", format_version: 1, exported_at: "2026-10-02T09:30:00+00:00", entries: [] };
    rpc.mockResolvedValue({ data: doc, error: null });
    const result = await exportMyData();
    expect(rpc).toHaveBeenCalledWith("export_my_data");
    expect(result).toEqual({ status: "ok", json: JSON.stringify(doc), date: "2026-10-02" });
    expect(exportFileName("2026-10-02")).toBe("moodbow-export-2026-10-02.json");
    expect(exportFileName("")).toBe("moodbow-export.json");
  });

  it("the file names use the export day in the profile's time zone (decision 107)", async () => {
    // 2026-10-02 23:30 UTC = the morning of 2026-10-03 in Bangkok.
    const at = "2026-10-02T23:30:00Z";
    rpc.mockResolvedValue({ data: { format: "moodbow-export", format_version: 1, exported_at: at, profile: { time_zone: "Asia/Bangkok" } }, error: null });
    expect(await exportMyData()).toMatchObject({ status: "ok", date: "2026-10-03" });
    rpc.mockResolvedValue({ data: { format: "moodbow-export", format_version: 1, exported_at: at, profile: { time_zone: "America/Sao_Paulo" } }, error: null });
    expect(await exportMyData()).toMatchObject({ date: "2026-10-02" });
    // No or an unknown zone: UTC.
    rpc.mockResolvedValue({ data: { format: "moodbow-export", format_version: 1, exported_at: at, profile: { time_zone: "Not/AZone" } }, error: null });
    expect(await exportMyData()).toMatchObject({ date: "2026-10-02" });
  });

  it("an error is an error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await exportMyData()).toEqual({ status: "error" });
  });
});

describe("deleteMyAccount", () => {
  it("needs DELETE typed: anything else never reaches the RPC", async () => {
    for (const word of ["", "delete", "DELET", "SUPPRIMER"]) expect(await deleteMyAccount(idle, confirm(word))).toEqual({ status: "error", error: "confirm" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("deletes, signs this browser out, wipes this user's local copies (decision 85), and says so on sign-in", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const thrown = (await deleteMyAccount(idle, confirm(" DELETE ")).catch((e) => e)) as Redirect;
    expect(rpc).toHaveBeenCalledWith("delete_my_account");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(setCookie).toHaveBeenCalledWith("mb_wipe", UID, expect.objectContaining({ maxAge: 60, httpOnly: false }));
    expect(thrown.args).toEqual({ href: "/sign-in?signed_out=deleted", locale: "en" });
  });

  it("a sign-out refused after the delete still finishes", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    signOut.mockRejectedValue(new Error("user_not_found"));
    const thrown = (await deleteMyAccount(idle, confirm("DELETE")).catch((e) => e)) as Redirect;
    expect(thrown.args.href).toBe("/sign-in?signed_out=deleted");
  });

  it("the RPC fails: nothing is cleared, the generic error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await deleteMyAccount(idle, confirm("DELETE"))).toEqual({ status: "error", error: "generic" });
    expect(signOut).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("an Auth outage is the generic error, never a sign-out", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthRetryableFetchError" } });
    expect(await deleteMyAccount(idle, confirm("DELETE"))).toEqual({ status: "error", error: "generic" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("saveReminder", () => {
  const reminder = (on: string, time: string) => {
    const f = new FormData();
    f.set("reminder_on", on);
    f.set("reminder_time", time);
    return f;
  };

  it("saves on/off and the time with update_settings", async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    expect(await saveReminder(idle, reminder("true", "07:30"))).toEqual({ status: "saved", on: true, time: "07:30" });
    expect(rpc).toHaveBeenCalledWith("update_settings", { p_reminder_on: true, p_reminder_time: "07:30" });
    expect(await saveReminder(idle, reminder("false", "21:00"))).toEqual({ status: "saved", on: false, time: "21:00" });
  });

  it("a malformed time never reaches the RPC; a failure is an error", async () => {
    expect(await saveReminder(idle, reminder("true", "25:00"))).toMatchObject({ status: "error" });
    expect(await saveReminder(idle, reminder("true", "7:30"))).toMatchObject({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await saveReminder(idle, reminder("true", "07:30"))).toEqual({ status: "error", on: true, time: "07:30" });
  });
});

describe("Me → AI actions (M9; reflect.md, Me → AI)", () => {
  const AI = { kind: "ai", version: "2026-10-02" };

  it("on: the consent first, then the setting", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await setAiEnabled(true)).toEqual({ ok: true });
    expect(rpc.mock.calls).toEqual([
      ["record_consents", { p_items: [{ ...AI, granted: true }] }],
      ["update_settings", { p_ai_enabled: true }],
    ]);
  });

  it("off: the setting first, then the recorded withdrawal", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await setAiEnabled(false)).toEqual({ ok: true });
    expect(rpc.mock.calls).toEqual([
      ["update_settings", { p_ai_enabled: false }],
      ["record_consents", { p_items: [{ ...AI, granted: false }] }],
    ]);
  });

  it("on: a failed step stops there; AI stays off; a lost session goes to sign-in", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await setAiEnabled(true)).toEqual({ ok: false, aiEnabled: false });
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "not_authenticated" } });
    await expect(saveTone("brief")).rejects.toBeInstanceOf(Redirect);
  });

  it("off: switching off failed → still on; only the withdrawal failed → off, withdrawal pending; the retry records only it (reviewer #33)", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await setAiEnabled(false)).toEqual({ ok: false, aiEnabled: true });
    rpc.mockReset();
    rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await setAiEnabled(false)).toEqual({ ok: false, aiEnabled: false, pending: "withdrawal" });
    rpc.mockReset();
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await recordAiWithdrawal()).toEqual({ ok: true });
    expect(rpc.mock.calls).toEqual([["record_consents", { p_items: [{ ...AI, granted: false }] }]]);
  });

  it("tone and focus: only known values reach the database", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await saveTone("brief")).toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith("update_settings", { p_tone: "brief" });
    expect(await saveFocusAreas(["sleep", "self_esteem"])).toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith("update_settings", { p_focus_areas: ["sleep", "self_esteem"] });
    rpc.mockClear();
    expect(await saveTone("shouty")).toEqual({ ok: false });
    expect(await saveFocusAreas(["sleep", "money"])).toEqual({ ok: false });
    expect(await setAiEnabled("yes" as unknown as boolean)).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("saveRegion (Me → Language & region)", () => {
  it("one field per call through update_profile; only valid values reach the database", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await saveRegion("country", "TH")).toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith("update_profile", { p_country: "TH" });
    expect(await saveRegion("country", "")).toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith("update_profile", { p_country: "" });
    expect(await saveRegion("time_zone", "Asia/Bangkok")).toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith("update_profile", { p_time_zone: "Asia/Bangkok" });
    expect(await saveRegion("locale", "en")).toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith("update_profile", { p_locale: "en" });
    rpc.mockClear();
    for (const [field, value] of [["country", "XX"], ["country", "th"], ["time_zone", "../x"], ["locale", "fr"], ["nope", "x"]] as const) {
      expect(await saveRegion(field as "country", value), `${field}=${value}`).toEqual({ ok: false });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the database says no (invalid_time_zone): the error; a lost session: sign in", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "invalid_time_zone" } });
    expect(await saveRegion("time_zone", "Mars/Olympus")).toEqual({ ok: false });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "not_authenticated" } });
    await expect(saveRegion("country", "TH")).rejects.toBeInstanceOf(Redirect);
  });
});
