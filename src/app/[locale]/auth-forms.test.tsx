import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// Coverage pass (UX): sign-in, forgot password and sign-up, every state the
// server action can answer with. The action's answer is set directly (the
// same approach as auth-forms-a11y.test.tsx); the actions themselves are
// tested in their own files.
let state: Record<string, unknown> = { status: "idle" };
let pending = false;
vi.mock("react", async (orig) => {
  const React = await orig<typeof import("react")>();
  return { ...React, useActionState: () => [state, () => {}, pending] };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("./sign-up/actions", () => ({ signUpFlow: vi.fn() }));
vi.mock("./sign-in/actions", () => ({ signIn: vi.fn() }));
vi.mock("./forgot-password/actions", () => ({ requestPasswordReset: vi.fn() }));
const { SignInForm } = await import("./sign-in/SignInForm");
const { ForgotPasswordForm } = await import("./forgot-password/ForgotPasswordForm");
const { SignUpForm } = await import("./sign-up/SignUpForm");

const a = messages.auth;
const o = messages.onboarding;
const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
const hidden = (name: string, form: Element | Document = document) => (form.querySelector(`input[type=hidden][name=${name}]`) as HTMLInputElement | null)?.value;

beforeEach(() => {
  state = { status: "idle" };
  pending = false;
});
afterEach(cleanup);

describe("SignInForm", () => {
  it("idle: email and password, Sign in, the forgot and create-account links; no error, no resend", () => {
    wrap(<SignInForm />);
    expect(screen.getByLabelText(a.emailLabel)).toHaveValue("");
    expect(screen.getByLabelText(a.passwordLabel)).toHaveAttribute("type", "password");
    expect(hidden("intent")).toBe("signin");
    expect(screen.getByRole("button", { name: a.signinSubmit })).toBeEnabled();
    expect(screen.queryByTestId("signin-error")).toBeNull();
    expect(screen.queryByRole("button", { name: a.checkEmailResend })).toBeNull();
    expect(screen.getByRole("link", { name: a.signinForgot })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByTestId("signin-to-signup")).toHaveAttribute("href", "/welcome");
  });

  for (const [error, key] of [
    ["emailInvalid", "errEmailInvalid"],
    ["badCredentials", "errBadCredentials"],
    ["rateLimited", "errRateLimited"],
    ["generic", "errGeneric"],
  ] as const) {
    it(`${error}: its message, tied to the email field; the typed email is kept`, () => {
      state = { status: "error", error, email: "a@b.co" };
      wrap(<SignInForm />);
      expect(screen.getByTestId("signin-error")).toHaveTextContent(a[key]);
      expect(screen.getByLabelText(a.emailLabel)).toHaveValue("a@b.co");
      expect(screen.getByLabelText(a.emailLabel).getAttribute("aria-describedby")).toContain("signin-error");
    });
  }

  it("email not confirmed: says so, and offers Send it again (the resend intent)", () => {
    state = { status: "notConfirmed", email: "a@b.co" };
    wrap(<SignInForm />);
    expect(screen.getByTestId("signin-error")).toHaveTextContent(a.errEmailNotConfirmed);
    const resend = screen.getByRole("button", { name: a.checkEmailResend });
    expect(hidden("intent", resend.closest("form")!)).toBe("resend");
  });

  it("sent again: announced in the status region; Send it again is still there; no error", () => {
    state = { status: "resent", email: "a@b.co" };
    wrap(<SignInForm />);
    expect(screen.getByTestId("signin-resent")).toHaveTextContent(a.checkEmailResent);
    expect(screen.queryByTestId("signin-error")).toBeNull();
    expect(screen.getByRole("button", { name: a.checkEmailResend })).toBeInTheDocument();
  });

  it("while it's sending: the buttons are disabled", () => {
    state = { status: "notConfirmed", email: "a@b.co" };
    pending = true;
    wrap(<SignInForm />);
    expect(screen.getByRole("button", { name: a.signinSubmit })).toBeDisabled();
    expect(screen.getByRole("button", { name: a.checkEmailResend })).toBeDisabled();
  });
});

describe("ForgotPasswordForm", () => {
  it("idle: the explanation, the email field and the button; no error", () => {
    wrap(<ForgotPasswordForm />);
    expect(screen.getByText(a.resetBody)).toBeInTheDocument();
    expect(screen.getByLabelText(a.emailLabel)).toHaveValue("");
    expect(screen.getByRole("button", { name: a.resetSubmit })).toBeEnabled();
    expect(screen.queryByTestId("forgot-error")).toBeNull();
  });

  it("an invalid email: its message, tied to the field; the email is kept", () => {
    state = { status: "error", error: "emailInvalid", email: "nope" };
    wrap(<ForgotPasswordForm />);
    expect(screen.getByTestId("forgot-error")).toHaveTextContent(a.errEmailInvalid);
    expect(screen.getByLabelText(a.emailLabel)).toHaveValue("nope");
    expect(screen.getByLabelText(a.emailLabel).getAttribute("aria-describedby")).toContain("forgot-error");
  });

  it("a failure: the generic message", () => {
    state = { status: "error", error: "generic", email: "a@b.co" };
    wrap(<ForgotPasswordForm />);
    expect(screen.getByTestId("forgot-error")).toHaveTextContent(a.errGeneric);
  });

  it("sent: the neutral answer naming the email, the hint and Sign in; no form", () => {
    state = { status: "sent", email: "a@b.co" };
    wrap(<ForgotPasswordForm />);
    expect(screen.getByTestId("reset-sent")).toHaveTextContent("a@b.co");
    expect(screen.getByTestId("reset-sent-hint")).toHaveTextContent(a.resetSentHint);
    expect(screen.getByRole("link", { name: a.signinSubmit })).toHaveAttribute("href", "/sign-in");
    expect(screen.queryByRole("button", { name: a.resetSubmit })).toBeNull();
  });

  it("while it's sending: the button is disabled", () => {
    pending = true;
    wrap(<ForgotPasswordForm />);
    expect(screen.getByRole("button", { name: a.resetSubmit })).toBeDisabled();
  });
});

describe("SignUpForm", () => {
  it("idle: the fields, the browser's time zone, an unchecked age box, the link to sign in; no error", () => {
    wrap(<SignUpForm />);
    expect(hidden("intent")).toBe("signup");
    expect(hidden("time_zone")).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(screen.getByTestId("signup-age")).not.toBeChecked();
    expect(screen.queryByTestId("signup-error")).toBeNull();
    expect(screen.getByTestId("signup-to-signin")).toHaveAttribute("href", "/sign-in");
    expect(screen.getByTestId("signup-submit")).toBeEnabled();
  });

  it("an error keeps the email and the age box; a failure is the generic message (no field)", () => {
    state = { status: "error", error: "generic", email: "a@b.co", age: true };
    wrap(<SignUpForm />);
    expect(screen.getByTestId("signup-error")).toHaveTextContent(a.errGeneric);
    expect(screen.getByLabelText(a.emailLabel)).toHaveValue("a@b.co");
    expect(screen.getByTestId("signup-age")).toBeChecked();
    expect(screen.getByLabelText(a.emailLabel)).not.toHaveAttribute("aria-invalid");
  });

  it("the password typed here is what 'I've confirmed my email' signs in with (kept in memory only)", () => {
    const view = wrap(<SignUpForm />);
    fireEvent.change(screen.getByLabelText(a.passwordLabel), { target: { value: "secret-123" } });
    state = { status: "checkEmail", email: "a@b.co" };
    view.rerender(<NextIntlClientProvider locale="en" messages={messages}><SignUpForm /></NextIntlClientProvider>);
    const confirmed = screen.getByTestId("check-email-confirmed").closest("form")!;
    expect(hidden("intent", confirmed)).toBe("confirmed");
    expect(hidden("password", confirmed)).toBe("secret-123");
  });

  it("check your email: the address in the body, I've confirmed, Send it again (the resend intent)", () => {
    state = { status: "checkEmail", email: "a@b.co" };
    wrap(<SignUpForm />);
    expect(screen.getByTestId("check-email")).toHaveTextContent("a@b.co");
    expect(hidden("intent", screen.getByTestId("check-email-resend").closest("form")!)).toBe("resend");
    expect(screen.queryByTestId("check-email-notice")).toBeNull();
  });

  for (const [notice, key] of [
    ["notConfirmed", "errEmailNotConfirmed"],
    ["rateLimited", "errRateLimited"],
    ["generic", "errGeneric"],
  ] as const) {
    it(`check your email, ${notice}: an alert`, () => {
      state = { status: "checkEmail", email: "a@b.co", notice };
      wrap(<SignUpForm />);
      const shown = screen.getByTestId("check-email-notice");
      expect(shown).toHaveAttribute("role", "alert");
      expect(shown).toHaveTextContent(a[key]);
    });
  }

  it("sent again: in the status region; pressing Send it again empties it until the next answer (reviewer #39)", () => {
    state = { status: "checkEmail", email: "a@b.co", notice: "resent" };
    wrap(<SignUpForm />);
    expect(screen.getByTestId("check-email-notice")).toHaveTextContent(a.checkEmailResent);
    expect(screen.getByTestId("check-email-notice")).toHaveAttribute("role", "status");
    fireEvent.submit(screen.getByTestId("check-email-resend").closest("form")!);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("while it's sending: every button is disabled", () => {
    state = { status: "checkEmail", email: "a@b.co" };
    pending = true;
    wrap(<SignUpForm />);
    expect(screen.getByTestId("check-email-confirmed")).toBeDisabled();
    expect(screen.getByTestId("check-email-resend")).toBeDisabled();
  });
});
