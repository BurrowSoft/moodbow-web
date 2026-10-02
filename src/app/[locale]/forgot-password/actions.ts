"use server";

import { isValidEmail, normalizeEmail } from "@/lib/email";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ForgotPasswordState = { status: "idle" } | { status: "error"; error: "emailInvalid" } | { status: "sent"; email: string };

// Sends the recovery email. The answer is ALWAYS the same neutral "If an
// account exists for …" once the email is well-formed, whatever Supabase
// says: its errors differ between existing and unknown addresses (e.g. the
// project-wide email rate limit only triggers for real accounts), so any
// branch on them would reveal who has an account (UX + reviewer, #5).
// No redirect URL: the send-email hook builds the link
// (/auth/confirm?type=recovery) itself.
export async function requestPasswordReset(_prev: ForgotPasswordState, form: FormData): Promise<ForgotPasswordState> {
  const email = normalizeEmail(form.get("email"));
  if (!isValidEmail(email)) return { status: "error", error: "emailInvalid" };
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.resetPasswordForEmail(email);
  return { status: "sent", email };
}
