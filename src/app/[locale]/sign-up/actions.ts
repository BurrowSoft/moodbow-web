"use server";

import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { isRateLimit } from "@/lib/authErrors";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { consentItem } from "@/lib/legalVersions";
import { CONSENT_COOKIE, parseConsentCookie } from "@/lib/onboardingConsent";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignUpState =
  | { status: "idle" }
  // email/age echo what was typed: React resets the form after an action,
  // and the fields come back from these values (the password is held by the
  // page and never echoed).
  | { status: "error"; error: "emailInvalid" | "passwordShort" | "ageRequired" | "emailTaken" | "generic"; email?: string; age?: boolean }
  // notice: the outcome of the last action on the Check email step.
  | { status: "checkEmail"; email: string; notice?: "resent" | "notConfirmed" | "rateLimited" | "generic" };

// The IANA zone the browser reports; the DB validates it and falls back to
// UTC when it's not one Postgres knows.
const TIME_ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;

// One action for the Create account screen and its Check email step:
// intent=signup creates the account; intent=confirmed ("I've confirmed my
// email") signs in with the credentials still held in the page's memory;
// intent=resend sends the confirmation again. Passwords are never logged,
// stored or returned.
export async function signUpFlow(prev: SignUpState, form: FormData): Promise<SignUpState> {
  const intent = form.get("intent");
  if (intent === "resend") return resend(prev);
  if (intent === "confirmed") return confirmedSignIn(prev, form);
  return signUp(form);
}

async function signUp(form: FormData): Promise<SignUpState> {
  const locale = await getLocale();
  type SignUpError = Extract<SignUpState, { status: "error" }>["error"];
  const fail = (error: SignUpError): SignUpState => ({ status: "error", error, email: String(form.get("email") ?? ""), age: form.get("age") === "on" });
  const email = normalizeEmail(form.get("email"));
  const password = String(form.get("password") ?? "");
  if (!isValidEmail(email)) return fail("emailInvalid");
  if ([...password].length < PASSWORD_MIN_LENGTH) return fail("passwordShort");
  if (form.get("age") !== "on") return fail("ageRequired");

  // Consent comes first (M3): no account without the grants from /consent.
  const store = await cookies();
  const consents = parseConsentCookie(store.get(CONSENT_COOKIE)?.value);
  if (!consents) return redirect({ href: "/consent", locale });

  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("generic");
  const tz = String(form.get("time_zone") ?? "");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Read by the auth trigger (moodbow-app migration 001): profile + consents.
    // No country: the web doesn't know it (the registry default applies).
    options: { data: { locale, time_zone: TIME_ZONE.test(tz) ? tz : null, consents: [...consents, consentItem("age_18")] } },
  });
  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") return fail("emailTaken");
    if (error.code === "weak_password") return fail("passwordShort");
    if (error.code === "email_address_invalid") return fail("emailInvalid");
    return fail("generic");
  }
  // With email confirmation on, Supabase answers an existing address with a
  // user that has no identities (and sends nothing).
  if (data.user && data.user.identities?.length === 0) return fail("emailTaken");
  // No confirmation required on this project → already signed in.
  if (data.session) {
    store.delete(CONSENT_COOKIE);
    return redirect({ href: "/setup", locale });
  }
  // The consent cookie stays until the user leaves this page signed in: the
  // action's response re-renders /sign-up, which sends anyone without it
  // back to /consent and would lose the Check email step (Web Tester, #6).
  // It expires on its own after an hour if the flow is abandoned.
  return { status: "checkEmail", email };
}

async function confirmedSignIn(prev: SignUpState, form: FormData): Promise<SignUpState> {
  if (prev.status !== "checkEmail") return prev;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ...prev, notice: "generic" };
  const password = String(form.get("password") ?? "");
  const { error } = await supabase.auth.signInWithPassword({ email: prev.email, password });
  if (error) return { ...prev, notice: error.code === "email_not_confirmed" ? "notConfirmed" : "generic" };
  // Signed in and leaving /sign-up: the consents are in the account now.
  (await cookies()).delete(CONSENT_COOKIE);
  return redirect({ href: "/setup", locale: await getLocale() });
}

async function resend(prev: SignUpState): Promise<SignUpState> {
  if (prev.status !== "checkEmail") return prev;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ...prev, notice: "generic" };
  const { error } = await supabase.auth.resend({ type: "signup", email: prev.email });
  // UX: the user's own just-created account, so a rate limit is named.
  return { ...prev, notice: !error ? "resent" : isRateLimit(error) ? "rateLimited" : "generic" };
}
