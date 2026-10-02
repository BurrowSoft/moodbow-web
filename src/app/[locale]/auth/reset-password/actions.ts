"use server";

import { validateNewPassword } from "@/lib/password";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "done" }
  | { status: "error"; error: "short" | "mismatch" | "same" | "expired" | "generic" };

// Sets the new password for the session that /auth/confirm (type=recovery)
// created, then ends that session: the user signs in again with the new
// password, in the app or on the web. The password is never logged.
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
  await supabase.auth.signOut({ scope: "local" });
  return { status: "done" };
}
