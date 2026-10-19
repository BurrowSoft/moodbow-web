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
const { exportMyData, deleteMyAccount } = await import("./actions");

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
