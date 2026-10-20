// @vitest-environment node
import { FunctionsHttpError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The report server action (report.md): only the tap's client_key is sent,
// with the user's token; the function's answers map to what Insights shows.
const invoke = vi.fn();
const del = vi.fn();
const client = {
  auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "jwt" } } })) },
  functions: { invoke: (...a: unknown[]) => invoke(...a) },
  from: vi.fn(() => ({ delete: () => ({ eq: (...a: unknown[]) => ({ eq: (...b: unknown[]) => del(a, b) }) }) })),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
vi.mock("@/i18n/navigation", () => ({ redirect: (...a: unknown[]) => redirect(...(a as [])) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
const { deleteWeeklyReport, requestWeeklyReport } = await import("./reportActions");

const KEY = "3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const ID = "0b5f2c1e-7d3a-4e8b-9c41-2a6f8e1d3b70";
const httpError = (status: number, body: unknown) => new FunctionsHttpError(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

beforeEach(() => {
  invoke.mockReset();
  del.mockReset();
  redirect.mockClear();
});

describe("requestWeeklyReport", () => {
  it("sends only the client_key with the user's token; a 200 becomes the report and the balance", async () => {
    invoke.mockResolvedValueOnce({ data: { report: { id: ID, week_start: "2026-10-12", body: { sections: { changed: "a", went_well: "b", notice: "c" } }, tier: "lite", created_at: "t" }, credits: { balance: 0 } }, error: null });
    const r = await requestWeeklyReport(KEY);
    expect(invoke).toHaveBeenCalledWith("report", expect.objectContaining({ body: { client_key: KEY }, headers: { Authorization: "Bearer jwt" } }));
    expect(r).toEqual({ status: "ok", report: { id: ID, week_start: "2026-10-12", body: { sections: { changed: "a", went_well: "b", notice: "c" } }, tier: "lite", created_at: "t" }, balance: 0 });
  });

  it("the function's error codes; a gateway page is no answer; 401 signs in again", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(422, { error: "not_enough" }) });
    expect(await requestWeeklyReport(KEY)).toEqual({ status: "error", message: "reportNotEnough" });
    invoke.mockResolvedValueOnce({ data: null, error: httpError(502, { error: "report_failed" }) });
    expect(await requestWeeklyReport(KEY)).toEqual({ status: "error", message: "reportError" });
    invoke.mockResolvedValueOnce({ data: null, error: httpError(409, { error: "in_progress" }) });
    expect(await requestWeeklyReport(KEY)).toEqual({ status: "in_progress" });
    invoke.mockResolvedValueOnce({ data: null, error: httpError(504, "<html>Gateway Timeout</html>") });
    expect(await requestWeeklyReport(KEY)).toEqual({ status: "no_answer" });
    invoke.mockRejectedValueOnce(new Error("fetch failed"));
    expect(await requestWeeklyReport(KEY)).toEqual({ status: "no_answer" });
    invoke.mockResolvedValueOnce({ data: null, error: httpError(401, { error: "unauthorized" }) });
    await expect(requestWeeklyReport(KEY)).rejects.toThrow("NEXT_REDIRECT");
  });

  it("a malformed 200 or a bad key: the report error, nothing sent for a bad key", async () => {
    invoke.mockResolvedValueOnce({ data: { report: { id: ID, week_start: "2026-10-12", body: { sections: { changed: "a" } } } }, error: null });
    expect(await requestWeeklyReport(KEY)).toEqual({ status: "error", message: "reportError" });
    invoke.mockClear();
    expect(await requestWeeklyReport("nope")).toEqual({ status: "error", message: "reportError" });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("deleteWeeklyReport", () => {
  it("an RLS delete of that weekly report by id", async () => {
    del.mockResolvedValueOnce({ error: null });
    expect(await deleteWeeklyReport(ID)).toEqual({ ok: true });
    expect(client.from).toHaveBeenCalledWith("ai_reports");
    expect(del).toHaveBeenCalledWith(["id", ID], ["kind", "weekly"]);
    expect(await deleteWeeklyReport("nope")).toEqual({ ok: false });
  });
});
