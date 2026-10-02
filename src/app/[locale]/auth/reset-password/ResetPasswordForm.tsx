"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { resetPassword, type ResetPasswordState } from "./actions";

const ERROR_KEYS = {
  short: "errShort",
  mismatch: "errMismatch",
  same: "errSame",
  expired: "errExpired",
  generic: "errGeneric",
} as const;

const inputClass =
  "mt-2 block w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text outline-none focus-visible:border-accent";

export function ResetPasswordForm() {
  const t = useTranslations("resetPassword");
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(resetPassword, { status: "idle" });

  if (state.status === "done") {
    return (
      <p role="status" data-testid="reset-done" className="rounded-2xl border border-border bg-surface px-5 py-4 font-medium text-text">
        {t("success")}
      </p>
    );
  }

  const error = state.status === "error" ? state.error : null;
  return (
    <form action={action} noValidate className="space-y-5">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-text">
          {t("newPassword")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          aria-describedby="password-hint"
          className={inputClass}
        />
        <p id="password-hint" className="mt-1 text-sm">
          {t("hint")}
        </p>
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-text">
          {t("confirmPassword")}
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={inputClass} />
      </div>
      {error && (
        <p role="alert" data-testid="reset-error" className="font-medium text-accent">
          {t(ERROR_KEYS[error])}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[52px] min-w-[200px] items-center justify-center rounded-full bg-accent px-8 py-3.5 text-base font-medium text-on-accent hover:opacity-90 disabled:opacity-60"
      >
        {t("submit")}
      </button>
    </form>
  );
}
