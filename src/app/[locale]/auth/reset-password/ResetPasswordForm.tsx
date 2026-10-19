"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { STATUS_BUTTON } from "@/components/statusButton";
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

  const error = state.status === "error" ? state.error : null;
  // The error is tied to the field it's about (aria-invalid + described by).
  const on = error === "short" || error === "same" ? "password" : error === "mismatch" ? "confirm" : null;
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
          aria-describedby={on === "password" ? "password-hint reset-error" : "password-hint"}
          aria-invalid={on === "password" ? true : undefined}
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
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby={on === "confirm" ? "reset-error" : undefined}
          aria-invalid={on === "confirm" ? true : undefined}
          className={inputClass}
        />
      </div>
      {error && (
        <p id="reset-error" role="alert" data-testid="reset-error" className="font-medium text-accent">
          {t(ERROR_KEYS[error])}
        </p>
      )}
      {/* Centred, like the action on every status page (StatusShell). */}
      <div className="flex justify-center">
        <button type="submit" disabled={pending} className={STATUS_BUTTON}>
          {t("submit")}
        </button>
      </div>
    </form>
  );
}
