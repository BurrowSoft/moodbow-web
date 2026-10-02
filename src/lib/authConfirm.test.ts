import { describe, expect, it } from "vitest";
import { CONFIRM_FAILED, confirmTarget, keepsSession, parseConfirmLink } from "./authConfirm";
import { classifyAuthLink } from "./authLink";
import { validateNewPassword } from "./password";

const HASH = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071829";

describe("parseConfirmLink", () => {
  it("accepts the hook's types with a token hash", () => {
    for (const type of ["signup", "recovery", "magiclink", "invite", "email_change", "email"]) {
      expect(parseConfirmLink(new URLSearchParams({ token_hash: HASH, type })), type).toEqual({ tokenHash: HASH, type });
    }
    expect(parseConfirmLink(new URLSearchParams({ token_hash: `pkce_${HASH}`, type: "signup" }))?.tokenHash).toBe(`pkce_${HASH}`);
  });

  it("rejects missing, malformed or unknown values (no API call is made)", () => {
    expect(parseConfirmLink(new URLSearchParams({ type: "signup" }))).toBeNull();
    expect(parseConfirmLink(new URLSearchParams({ token_hash: HASH }))).toBeNull();
    expect(parseConfirmLink(new URLSearchParams({ token_hash: HASH, type: "sms" }))).toBeNull();
    expect(parseConfirmLink(new URLSearchParams({ token_hash: "short", type: "signup" }))).toBeNull();
    expect(parseConfirmLink(new URLSearchParams({ token_hash: "abc def<script>", type: "signup" }))).toBeNull();
  });
});

describe("confirmTarget / keepsSession", () => {
  it("routes each type to a clean page", () => {
    expect(confirmTarget("signup", true)).toEqual({ path: "/email-confirmed" });
    expect(confirmTarget("magiclink", true)).toEqual({ path: "/email-confirmed" });
    expect(confirmTarget("recovery", true)).toEqual({ path: "/auth/reset-password" });
    expect(confirmTarget("email_change", true)).toEqual({ path: "/email-confirmed", result: "email_changed" });
    expect(CONFIRM_FAILED).toEqual({ path: "/email-confirmed", result: "expired" });
  });

  it("the first of two email-change confirmations doesn't claim the change happened", () => {
    expect(confirmTarget("email_change", false)).toEqual({ path: "/email-confirmed", result: "email_change_pending" });
  });

  it("only recovery keeps the web session while the web journal is off", () => {
    expect(keepsSession("recovery", false)).toBe(true);
    expect(keepsSession("signup", false)).toBe(false);
    expect(keepsSession("email_change", false)).toBe(false);
    expect(keepsSession("signup", true)).toBe(true);
  });
});

describe("classifyAuthLink", () => {
  it("reads /auth/confirm's result param", () => {
    expect(classifyAuthLink("?result=expired", "")).toBe("error");
    expect(classifyAuthLink("?result=email_changed", "")).toBe("email_changed");
    expect(classifyAuthLink("?result=email_change_pending", "")).toBe("email_change_pending");
    expect(classifyAuthLink("?result=whatever", "")).toBe("ok");
  });

  it("an error key wins over any result", () => {
    expect(classifyAuthLink("?result=email_changed", "#error=access_denied")).toBe("error");
  });
});

describe("validateNewPassword", () => {
  it("needs 8 characters (counted as characters) and a matching confirmation", () => {
    expect(validateNewPassword("1234567", "1234567")).toBe("short");
    expect(validateNewPassword("😀😀😀😀😀😀😀", "😀😀😀😀😀😀😀")).toBe("short");
    expect(validateNewPassword("12345678", "12345679")).toBe("mismatch");
    expect(validateNewPassword("12345678", "12345678")).toBeNull();
  });
});
