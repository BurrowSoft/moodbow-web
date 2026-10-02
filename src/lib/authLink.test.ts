import { describe, expect, it } from "vitest";
import { classifyAuthLink } from "./authLink";

describe("classifyAuthLink", () => {
  it("a clean URL or one with tokens is a success", () => {
    expect(classifyAuthLink("", "")).toBe("ok");
    expect(classifyAuthLink("?code=abc", "")).toBe("ok");
    expect(classifyAuthLink("", "#access_token=x&refresh_token=y&type=signup")).toBe("ok");
  });

  it("an error in the fragment (Supabase's expired link) is an error", () => {
    expect(
      classifyAuthLink("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"),
    ).toBe("error");
  });

  it("an error in the query string is an error", () => {
    expect(classifyAuthLink("?error=access_denied", "")).toBe("error");
    expect(classifyAuthLink("?error_code=otp_expired", "")).toBe("error");
  });
});
