"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SetupState = { status: "idle" } | { status: "error" };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Set up → "Start my journal": complete_onboarding (moodbow-app migration
// 004) saves the choices and marks the profile onboarded. Focus areas and
// tone keep their defaults while AI is off (their rows are hidden, as on the
// app). The reminder itself is a phone notification; the web only stores
// the setting.
export async function completeSetup(_prev: SetupState, form: FormData): Promise<SetupState> {
  const locale = await getLocale();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error" };
  const reminderOn = form.get("reminder_off") !== "on";
  const time = String(form.get("reminder_time") ?? "");
  const { error } = await supabase.rpc("complete_onboarding", {
    p_reminder_on: reminderOn,
    p_reminder_time: TIME.test(time) ? time : "21:00",
  });
  if (error) {
    // Consents went stale in between (a new policy version): Consent first.
    if (error.message.includes("consent_required")) return redirect({ href: "/consent", locale });
    if (error.message.includes("not_authenticated")) return redirect({ href: "/sign-in", locale });
    return { status: "error" };
  }
  return redirect({ href: "/app", locale });
}
