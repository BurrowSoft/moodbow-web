// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { logAuthFailure } from "./authErrors";

describe("logAuthFailure", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says what kind of failure it was, including a bad key's, which has no code", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    logAuthFailure("sign-in", { name: "AuthApiError", status: 401 });
    expect(log).toHaveBeenCalledWith("auth failure: sign-in", { name: "AuthApiError", status: 401, code: undefined });
  });

  it("never the message, which can hold the address", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    logAuthFailure("sign-up", Object.assign(new Error("a@b.co is not allowed"), { status: 400, code: "x" }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("a@b.co");
  });
});
