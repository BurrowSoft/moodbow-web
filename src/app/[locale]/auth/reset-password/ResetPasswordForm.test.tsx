import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// Reset-password errors for screen readers (a11y pass): each is tied to the
// field it's about.
let state: Record<string, unknown> = { status: "idle" };
vi.mock("react", async (orig) => {
  const React = await orig<typeof import("react")>();
  return { ...React, useActionState: () => [state, () => {}, false] };
});
vi.mock("./actions", () => ({ resetPassword: vi.fn() }));
const { ResetPasswordForm } = await import("./ResetPasswordForm");
afterEach(cleanup);

describe("reset-password errors point at their field", () => {
  for (const [error, field] of [
    ["short", "password"],
    ["same", "password"],
    ["mismatch", "confirm"],
  ] as const) {
    it(`${error} → ${field}`, () => {
      state = { status: "error", error };
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <ResetPasswordForm />
        </NextIntlClientProvider>,
      );
      const target = document.getElementById(field)!;
      expect(target).toHaveAttribute("aria-invalid", "true");
      expect(target.getAttribute("aria-describedby")).toContain("reset-error");
      const other = document.getElementById(field === "password" ? "confirm" : "password")!;
      expect(other).not.toHaveAttribute("aria-invalid");
    });
  }

  it("a general error (expired) is on no field", () => {
    state = { status: "error", error: "expired" };
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResetPasswordForm />
      </NextIntlClientProvider>,
    );
    expect(document.getElementById("password")).not.toHaveAttribute("aria-invalid");
    expect(document.getElementById("confirm")).not.toHaveAttribute("aria-invalid");
  });
});
