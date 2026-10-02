"use server";

import { isValidEmail, normalizeEmail } from "@/lib/email";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ForgotPasswordState =
  | { status: "idle" }
  | { status: "error"; error: "emailInvalid" | "generic" }
  | { status: "sent"; email: string };

// Sends the recovery email. The answer never says whether the account
// exists ("If an account exists for …"). No redirect URL: the send-email
// hook builds the link (/auth/confirm?type=recovery) itself.
export async function requestPasswordReset(_prev: ForgotPasswordState, form: FormData): Promise<ForgotPasswordState> {
  const email = normalizeEmail(form.get("email"));
  if (!isValidEmail(email)) return { status: "error", error: "emailInvalid" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", error: "generic" };
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  // Unknown addresses don't error; a real failure (rate limit, outage) does.
  if (error) return { status: "error", error: "generic" };
  return { status: "sent", email };
}
