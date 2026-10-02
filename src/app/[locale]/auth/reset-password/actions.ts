"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { validateNewPassword } from "@/lib/password";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "error"; error: "short" | "mismatch" | "same" | "expired" | "generic" };

// Sets the new password for the session that /auth/confirm (type=recovery)
// created, then signs the account out everywhere: the user signs in again
// with the new password, in the app or on the web. The password is never
// logged.
export async function resetPassword(_prev: ResetPasswordState, form: FormData): Promise<ResetPasswordState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const invalid = validateNewPassword(password, confirm);
  if (invalid) return { status: "error", error: invalid };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", error: "generic" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", error: "expired" };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Supabase's own checks (its minimum length could differ from ours,
    // reusing the current password). Codes, never messages.
    if (error.code === "weak_password") return { status: "error", error: "short" };
    if (error.code === "same_password") return { status: "error", error: "same" };
    if (error.code === "session_not_found" || error.code === "session_expired") return { status: "error", error: "expired" };
    return { status: "error", error: "generic" };
  }
  // Every session, on every device: a reset is also how someone takes back
  // an account another person got into.
  await supabase.auth.signOut({ scope: "global" });
  // A redirect, not a returned state: the sign-out changes cookies, so Next
  // re-renders the page, which (with no session left) would replace any
  // in-page success message with the expired copy.
  redirect({ href: { pathname: "/auth/reset-password", query: { status: "changed" } }, locale: await getLocale() });
  return { status: "idle" };
}
