"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AuthField, primaryButtonClass, textLinkClass } from "@/components/AuthField";
import { FocusOnMount } from "@/components/FocusOnMount";
import { signUpFlow, type SignUpState } from "./actions";

const ERROR_KEYS = {
  emailInvalid: ["auth", "errEmailInvalid"],
  passwordShort: ["onboarding", "errPasswordShort"],
  ageRequired: ["onboarding", "errAgeRequired"],
  emailTaken: ["onboarding", "errEmailTaken"],
  generic: ["auth", "errGeneric"],
} as const;

// The browser's IANA time zone, for the profile's "today" (never UTC dates).
const subscribe = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
const noTimeZoneOnServer = () => "";

// Create account → Check email, on one page. The password typed here stays
// in this component's memory only, so "I've confirmed my email" can sign in
// without asking again (decision: web-only button). Nothing is stored.
export function SignUpForm() {
  const t = useTranslations("onboarding");
  const ta = useTranslations("auth");
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUpFlow, { status: "idle" });
  const [password, setPassword] = useState("");
  const timeZone = useSyncExternalStore(subscribe, browserTimeZone, noTimeZoneOnServer);

  if (state.status === "checkEmail") {
    const NOTICES = {
      resent: "checkEmailResent",
      notConfirmed: "errEmailNotConfirmed",
      rateLimited: "errRateLimited",
      generic: "errGeneric",
    } as const;
    const notice = state.notice ? ta(NOTICES[state.notice]) : null;
    return (
      <div className="space-y-6" data-testid="check-email">
        <FocusOnMount className="text-2xl font-medium text-text">{t("checkEmailTitle")}</FocusOnMount>
        <p>{t("checkEmailBody", { email: state.email })}</p>
        {/* "Sent again" goes in a region that's always there (so it's
            announced); a problem is an alert. */}
        <p role="status" className="font-medium text-text empty:hidden" data-testid={state.notice === "resent" ? "check-email-notice" : undefined}>
          {state.notice === "resent" ? notice : null}
        </p>
        {notice && state.notice !== "resent" && (
          <p role="alert" data-testid="check-email-notice" className="font-medium text-text">
            {notice}
          </p>
        )}
        <form action={action}>
          <input type="hidden" name="intent" value="confirmed" />
          <input type="hidden" name="password" value={password} />
          <button type="submit" disabled={pending} data-testid="check-email-confirmed" className={primaryButtonClass}>
            {t("checkEmailConfirmed")}
          </button>
        </form>
        <form action={action}>
          <input type="hidden" name="intent" value="resend" />
          <button type="submit" disabled={pending} data-testid="check-email-resend" className={textLinkClass}>
            {t("checkEmailResend")}
          </button>
        </form>
      </div>
    );
  }

  const error = state.status === "error" ? state.error : null;
  const message = error ? (ERROR_KEYS[error][0] === "auth" ? ta(ERROR_KEYS[error][1]) : t(ERROR_KEYS[error][1])) : null;
  // The error is tied to the field it's about (aria-invalid + described by).
  const errorOn = error === "passwordShort" ? "password" : error === "ageRequired" ? "age" : error === "emailInvalid" || error === "emailTaken" ? "email" : null;
  return (
    <div className="space-y-6">
      <form action={action} noValidate className="space-y-5">
        <input type="hidden" name="intent" value="signup" />
        <input type="hidden" name="time_zone" value={timeZone} />
        <AuthField
          id="email"
          label={ta("emailLabel")}
          type="email"
          autoComplete="email"
          defaultValue={state.status === "error" ? state.email : undefined}
          errorId={errorOn === "email" ? "signup-error" : undefined}
        />
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-text">
            {ta("passwordLabel")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={errorOn === "password" ? "password-hint signup-error" : "password-hint"}
            aria-invalid={errorOn === "password" ? true : undefined}
            className="mt-2 block w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text outline-none focus-visible:border-accent"
          />
          <p id="password-hint" className="mt-1 text-sm">
            {t("passwordHint")}
          </p>
        </div>
        <label className="flex items-start gap-3 text-text">
          <input
            type="checkbox"
            name="age"
            data-testid="signup-age"
            defaultChecked={state.status === "error" ? state.age : false}
            aria-describedby={errorOn === "age" ? "signup-error" : undefined}
            aria-invalid={errorOn === "age" ? true : undefined}
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
          />
          <span>{t("ageConfirm")}</span>
        </label>
        {message && (
          <p id="signup-error" role="alert" data-testid="signup-error" className="font-medium text-accent">
            {message}
          </p>
        )}
        <button type="submit" disabled={pending} data-testid="signup-submit" className={primaryButtonClass}>
          {t("signupSubmit")}
        </button>
      </form>
      <p>
        <Link href="/sign-in" data-testid="signup-to-signin" className={textLinkClass}>
          {t("signupHaveAccount")}
        </Link>
      </p>
    </div>
  );
}
