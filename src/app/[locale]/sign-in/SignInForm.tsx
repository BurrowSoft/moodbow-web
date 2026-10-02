"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AuthField, primaryButtonClass, textLinkClass } from "@/components/AuthField";
import { signIn, type SignInState } from "./actions";

const ERROR_KEYS = {
  emailInvalid: "errEmailInvalid",
  badCredentials: "errBadCredentials",
  rateLimited: "errRateLimited",
  generic: "errGeneric",
} as const;

export function SignInForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { status: "idle" });

  const message =
    state.status === "error" ? t(ERROR_KEYS[state.error]) : state.status === "notConfirmed" ? t("errEmailNotConfirmed") : null;
  const lastEmail = state.status === "notConfirmed" || state.status === "resent" ? state.email : undefined;

  return (
    <div className="space-y-6">
      <form action={action} noValidate className="space-y-5">
        <input type="hidden" name="intent" value="signin" />
        <AuthField
          id="email"
          label={t("emailLabel")}
          type="email"
          autoComplete="email"
          defaultValue={lastEmail}
          errorId={message ? "signin-error" : undefined}
        />
        <AuthField id="password" label={t("passwordLabel")} type="password" autoComplete="current-password" />
        {message && (
          <p id="signin-error" role="alert" data-testid="signin-error" className="font-medium text-accent">
            {message}
          </p>
        )}
        {state.status === "resent" && (
          <p role="status" data-testid="signin-resent" className="font-medium text-text">
            {t("checkEmailResent")}
          </p>
        )}
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {t("signinSubmit")}
        </button>
      </form>
      {(state.status === "notConfirmed" || state.status === "resent") && (
        <form action={action}>
          <input type="hidden" name="intent" value="resend" />
          <button type="submit" disabled={pending} className={textLinkClass}>
            {t("checkEmailResend")}
          </button>
        </form>
      )}
      <p>
        <Link href="/forgot-password" className={textLinkClass}>
          {t("signinForgot")}
        </Link>
      </p>
    </div>
  );
}
