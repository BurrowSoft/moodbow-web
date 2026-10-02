"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AuthField, primaryButtonClass, textLinkClass } from "@/components/AuthField";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<ForgotPasswordState, FormData>(requestPasswordReset, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div className="space-y-6">
        <p role="status" data-testid="reset-sent" className="rounded-2xl border border-border bg-surface px-5 py-4 font-medium text-text">
          {t("resetSent", { email: state.email })}
        </p>
        <p data-testid="reset-sent-hint">{t("resetSentHint")}</p>
        <p>
          <Link href="/sign-in" className={textLinkClass}>
            {t("signinSubmit")}
          </Link>
        </p>
      </div>
    );
  }

  const message = state.status === "error" ? t("errEmailInvalid") : null;
  return (
    <form action={action} noValidate className="space-y-5">
      <p>{t("resetBody")}</p>
      <AuthField
        id="email"
        label={t("emailLabel")}
        type="email"
        autoComplete="email"
        defaultValue={state.status === "error" ? state.email : undefined}
        errorId={message ? "forgot-error" : undefined}
      />
      {message && (
        <p id="forgot-error" role="alert" data-testid="forgot-error" className="font-medium text-accent">
          {message}
        </p>
      )}
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {t("resetSubmit")}
      </button>
    </form>
  );
}
