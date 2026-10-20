"use server";

import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { DELETE_WORD, localDay } from "@/lib/journal/account";
import { isFocusArea, isTone } from "@/lib/journal/ai";
import { consentItem } from "@/lib/legalVersions";
import { isCountry, isTimeZoneName } from "@/lib/region/countries";
import { offeredLocales } from "@/i18n/routing";
import { WIPE_COOKIE, WIPE_COOKIE_OPTIONS } from "@/lib/supabase/proxy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Me → Sign out: this browser only (the app stays signed in).
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  redirect({ href: "/sign-in", locale: await getLocale() });
}

export type ExportResult = { status: "ok"; json: string; date: string } | { status: "error" };

// Me → Export my data: export_my_data() (migration 004), everything the
// user created as one JSON document, handed to the browser to save as a
// file. Nothing is stored on the way: the file is made in the browser.
export async function exportMyData(): Promise<ExportResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error" };
  const { data, error } = await supabase.rpc("export_my_data");
  if (error || !data) {
    if (error?.message.includes("not_authenticated")) return redirect({ href: "/sign-in", locale: await getLocale() });
    return { status: "error" };
  }
  const exportedAt = String((data as { exported_at?: unknown }).exported_at ?? "");
  // No indent: the whole journal travels in this one response (Vercel caps
  // it at 4.5 MB), so every byte counts. A streamed export is a follow-up.
  // The file names carry the export day in the person's own time zone (the
  // profile's; decision 107: "yesterday's date" in the morning looks like a
  // bug). The text's "Exported: … UTC" line stays UTC.
  const zone = (data as { profile?: { time_zone?: unknown } }).profile?.time_zone;
  return { status: "ok", json: JSON.stringify(data), date: localDay(exportedAt, typeof zone === "string" ? zone : "UTC") };
}

export type DeleteAccountState = { status: "idle" } | { status: "error"; error: "confirm" | "generic" };

// Me → Delete account: delete_my_account() removes the auth user and,
// with it, every row, right away (M7). Then this browser forgets the
// session and the user's local copies (pending check-ins, drafts:
// decision 85), and sign-in says it's done.
export async function deleteMyAccount(_prev: DeleteAccountState, form: FormData): Promise<DeleteAccountState> {
  if (String(form.get("confirm") ?? "").trim() !== DELETE_WORD) return { status: "error", error: "confirm" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", error: "generic" };
  const locale = await getLocale();
  const { data, error: userError } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return userError?.name === "AuthRetryableFetchError" ? { status: "error", error: "generic" } : redirect({ href: "/sign-in", locale });

  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { status: "error", error: "generic" };

  // The account is gone: the session's cookies go too (Auth may refuse the
  // sign-out itself now that the user doesn't exist; local scope clears the
  // cookies either way).
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  (await cookies()).set(WIPE_COOKIE, uid, WIPE_COOKIE_OPTIONS);
  return redirect({ href: "/sign-in?signed_out=deleted", locale });
}

export type ReminderState = { status: "idle" } | { status: "saved"; on: boolean; time: string } | { status: "error"; on: boolean; time: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Me → Daily reminder: update_settings(p_reminder_on, p_reminder_time). The
// reminder itself is a phone notification; the web only stores the setting
// (webReminderNote says so).
export async function saveReminder(_prev: ReminderState, form: FormData): Promise<ReminderState> {
  const on = form.get("reminder_on") === "true";
  const time = String(form.get("reminder_time") ?? "");
  if (!TIME.test(time)) return { status: "error", on, time };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", on, time };
  const { error } = await supabase.rpc("update_settings", { p_reminder_on: on, p_reminder_time: time });
  if (error) {
    if (error.message.includes("not_authenticated")) return redirect({ href: "/sign-in", locale: await getLocale() });
    return { status: "error", on, time };
  }
  return { status: "saved", on, time };
}

// Me → AI (M9; reflect.md, "Me → AI"). Each returns whether the account now
// has the value; the control reverts to the saved one when it doesn't
// (decision 111). Errors are codes, never messages.
export type AiSaveResult = { ok: true } | { ok: false };

const settingsFailed = async (message: string | undefined): Promise<AiSaveResult> => {
  if (message?.includes("not_authenticated")) return redirect({ href: "/sign-in", locale: await getLocale() });
  return { ok: false };
};

// The AI switch reports what the account has after a failure (it takes two
// steps), and whether the withdrawal is still to be recorded.
export type AiSwitchResult = { ok: true } | { ok: false; aiEnabled: boolean; pending?: "withdrawal" };

// On: record the AI consent, then switch AI on; a failure in either leaves
// AI off. Off: switch AI off, then record the withdrawal (a consent row
// with granted false). If only the withdrawal failed, AI IS off: say so,
// and the retry records just the withdrawal (reviewer #33).
export async function setAiEnabled(on: boolean): Promise<AiSwitchResult> {
  if (typeof on !== "boolean") return { ok: false, aiEnabled: !on };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, aiEnabled: !on };
  const failed = async (message: string, result: AiSwitchResult) => ((await settingsFailed(message)), result);
  if (on) {
    const consent = await supabase.rpc("record_consents", { p_items: [consentItem("ai", true)] });
    if (consent.error) return failed(consent.error.message, { ok: false, aiEnabled: false });
    const setting = await supabase.rpc("update_settings", { p_ai_enabled: true });
    if (setting.error) return failed(setting.error.message, { ok: false, aiEnabled: false });
    return { ok: true };
  }
  const setting = await supabase.rpc("update_settings", { p_ai_enabled: false });
  if (setting.error) return failed(setting.error.message, { ok: false, aiEnabled: true });
  return recordAiWithdrawal();
}

// The AI consent withdrawal alone (Try again after it failed; AI is
// already off).
export async function recordAiWithdrawal(): Promise<AiSwitchResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, aiEnabled: false, pending: "withdrawal" };
  const { error } = await supabase.rpc("record_consents", { p_items: [consentItem("ai", false)] });
  if (error) {
    await settingsFailed(error.message);
    return { ok: false, aiEnabled: false, pending: "withdrawal" };
  }
  return { ok: true };
}

export async function saveTone(tone: string): Promise<AiSaveResult> {
  if (!isTone(tone)) return { ok: false };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false };
  const { error } = await supabase.rpc("update_settings", { p_tone: tone });
  return error ? settingsFailed(error.message) : { ok: true };
}

export async function saveFocusAreas(areas: string[]): Promise<AiSaveResult> {
  if (!Array.isArray(areas) || !areas.every(isFocusArea)) return { ok: false };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false };
  const { error } = await supabase.rpc("update_settings", { p_focus_areas: areas });
  return error ? settingsFailed(error.message) : { ok: true };
}

// Me → Language & region (M7): one field at a time through
// update_profile(p_locale | p_country | p_time_zone) (migration 004, which
// checks each again). Country "" clears it (the safety card's default).
export type RegionField = "locale" | "country" | "time_zone";

export async function saveRegion(field: RegionField, value: string): Promise<AiSaveResult> {
  const valid =
    // Only an offered language (thai-offered-live): a draft /th never saves "th".
    field === "locale" ? (offeredLocales() as readonly string[]).includes(value) : field === "country" ? value === "" || isCountry(value) : field === "time_zone" ? isTimeZoneName(value) : false;
  if (!valid) return { ok: false };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false };
  const param = field === "locale" ? "p_locale" : field === "country" ? "p_country" : "p_time_zone";
  const { error } = await supabase.rpc("update_profile", { [param]: value });
  return error ? settingsFailed(error.message) : { ok: true };
}
