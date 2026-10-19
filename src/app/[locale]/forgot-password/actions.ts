"use server";

import { isValidEmail, normalizeEmail } from "@/lib/email";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ForgotPasswordState = { status: "idle" } | { status: "error"; error: "emailInvalid" | "generic"; email: string } | { status: "sent"; email: string };

// Sends the recovery email. The answer is ALWAYS the same neutral "If an
// account exists for …" once the email is well-formed, whatever Supabase
// says: its errors differ between existing and unknown addresses (e.g. the
// project-wide email rate limit only triggers for real accounts), so any
// branch on them would reveal who has an account (UX + reviewer, #5).
// No redirect URL: the send-email hook builds the link
// (/auth/confirm?type=recovery) itself.
export async function requestPasswordReset(_prev: ForgotPasswordState, form: FormData): Promise<ForgotPasswordState> {
  const email = normalizeEmail(form.get("email"));
  if (!isValidEmail(email)) return { status: "error", error: "emailInvalid", email: String(form.get("email") ?? "") };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "sent", email };
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  // The one exception: Auth didn't answer at all (unreachable, a gateway
  // error, or past the 10 s deadline: an AuthRetryableFetchError). That
  // says nothing about the address, and "sent" would be untrue for
  // everyone, so it's the generic error with Try again. Not every 5xx: a
  // failed email send (500) only happens for real accounts.
  if (error?.name === "AuthRetryableFetchError") return { status: "error", error: "generic", email };
  return { status: "sent", email };
}
