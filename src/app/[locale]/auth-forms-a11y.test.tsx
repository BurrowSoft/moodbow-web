import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// Sign-up / sign-in / forgot password for screen readers (a11y pass): an
// error is tied to the field it's about; a view that replaces the form
// takes focus; "sent again" lands in a region that was already there.
let state: Record<string, unknown> = { status: "idle" };
vi.mock("react", async (orig) => {
  const React = await orig<typeof import("react")>();
  return { ...React, useActionState: () => [state, () => {}, false] };
});
vi.mock("@/i18n/navigation", () => ({ Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }));
vi.mock("./sign-up/actions", () => ({ signUpFlow: vi.fn() }));
vi.mock("./sign-in/actions", () => ({ signIn: vi.fn(), signInFlow: vi.fn() }));
vi.mock("./forgot-password/actions", () => ({ requestPasswordReset: vi.fn() }));
const { SignUpForm } = await import("./sign-up/SignUpForm");
const { ForgotPasswordForm } = await import("./forgot-password/ForgotPasswordForm");

const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
afterEach(cleanup);

describe("sign-up errors point at their field", () => {
  for (const [error, field] of [
    ["emailInvalid", "email"],
    ["emailTaken", "email"],
    ["passwordShort", "password"],
    ["ageRequired", "age"],
  ] as const) {
    it(`${error} → ${field}`, () => {
      state = { status: "error", error, email: "a@b.co", age: false };
      wrap(<SignUpForm />);
      const target = field === "age" ? screen.getByTestId("signup-age") : document.getElementById(field)!;
      expect(target).toHaveAttribute("aria-invalid", "true");
      expect(target.getAttribute("aria-describedby")).toContain("signup-error");
      for (const other of ["email", "password"].filter((f) => f !== field)) expect(document.getElementById(other)).not.toHaveAttribute("aria-invalid");
    });
  }
});

describe("views that replace the form take focus", () => {
  it("sign-up's Check your email: its heading", () => {
    state = { status: "checkEmail", email: "a@b.co" };
    wrap(<SignUpForm />);
    expect(screen.getByRole("heading", { name: messages.onboarding.checkEmailTitle })).toHaveFocus();
    // The status region exists (empty) before any "sent again".
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
  it("forgot password's sent message", () => {
    state = { status: "sent", email: "a@b.co" };
    wrap(<ForgotPasswordForm />);
    expect(screen.getByTestId("reset-sent")).toHaveFocus();
  });
});
