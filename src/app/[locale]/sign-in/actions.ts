"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState =
  | { status: "idle" }
  | { status: "error"; error: "emailInvalid" | "badCredentials" | "generic" }
  // The email is kept so "Send it again" can resend the confirmation link.
  | { status: "notConfirmed"; email: string }
  | { status: "resent"; email: string };

// Email + password sign-in (and, with intent=resend, "Send it again").
// Supabase error codes map to copy, never its messages. The password is
// never logged or returned.
export async function signIn(prev: SignInState, form: FormData): Promise<SignInState> {
  if (form.get("intent") === "resend") return resendConfirmation(prev);
  const email = normalizeEmail(form.get("email"));
  const password = String(form.get("password") ?? "");
  if (!isValidEmail(email)) return { status: "error", error: "emailInvalid" };
  if (!password) return { status: "error", error: "badCredentials" };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", error: "generic" };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "invalid_credentials") return { status: "error", error: "badCredentials" };
    if (error.code === "email_not_confirmed") return { status: "notConfirmed", email };
    return { status: "error", error: "generic" };
  }
  redirect({ href: "/app", locale: await getLocale() });
  return { status: "idle" };
}

// "Send it again" after email_not_confirmed. No redirect URL: the send-email
// hook builds the link itself.
async function resendConfirmation(prev: SignInState): Promise<SignInState> {
  if (prev.status !== "notConfirmed" && prev.status !== "resent") return prev;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", error: "generic" };
  const { error } = await supabase.auth.resend({ type: "signup", email: prev.email });
  if (error) return { status: "error", error: "generic" };
  return { status: "resent", email: prev.email };
}
