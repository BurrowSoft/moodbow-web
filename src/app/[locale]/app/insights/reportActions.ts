"use server";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { isUuid, REFLECT_SERVER_DEADLINE_MS } from "@/lib/journal/reflect";
import { parseReportBody, reportOutcome, type ReportResult } from "@/lib/journal/report";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const toSignIn = async () => redirect({ href: "/sign-in", locale: await getLocale() });

// One call of the report edge function ("Your week", 1.1 D), server-side
// only, with the signed-in user's session (report.md: as reflect, the
// browser never calls it). Only the tap's client_key is sent: the server
// picks the week and reads the check-ins and entries itself, as that user.
// No report text is logged here.
export async function requestWeeklyReport(clientKey: string): Promise<ReportResult> {
  if (!isUuid(clientKey)) return { status: "error", message: "reportError" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "reportError" };
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) return toSignIn();
  let answer: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    answer = await supabase.functions.invoke("report", {
      body: { client_key: clientKey },
      headers: { Authorization: `Bearer ${token}` },
      timeout: REFLECT_SERVER_DEADLINE_MS,
    });
  } catch {
    return { status: "no_answer" };
  }
  const { data, error } = answer;
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const response = error.context as Response;
      if (response.status === 401) return toSignIn();
      const code = await response
        .json()
        .then((b: { error?: unknown }) => b?.error)
        .catch(() => undefined);
      // A gateway's own error page: not the function's answer.
      if (typeof code !== "string") return { status: "no_answer" };
      return reportOutcome(code);
    }
    return { status: "no_answer" };
  }
  const report = (data as { report?: { id?: unknown; week_start?: unknown; body?: unknown; tier?: unknown; created_at?: unknown } } | null)?.report;
  const body = parseReportBody(report?.body);
  if (!report || !body || !isUuid(report.id) || typeof report.week_start !== "string") return { status: "error", message: "reportError" };
  const balance = (data as { credits?: { balance?: unknown } }).credits?.balance;
  return {
    status: "ok",
    report: { id: report.id, week_start: report.week_start, body, tier: report.tier === "lite" ? "lite" : "full", created_at: String(report.created_at ?? "") },
    balance: typeof balance === "number" ? balance : null,
  };
}

export type DeleteReportResult = { ok: boolean };

// The user's own report, deleted by id (report.md: an RLS delete on
// ai_reports), which allows a new one for that week.
export async function deleteWeeklyReport(id: string): Promise<DeleteReportResult> {
  if (!isUuid(id)) return { ok: false };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false };
  const { error } = await supabase.from("ai_reports").delete().eq("id", id).eq("kind", "weekly");
  if (error) {
    if (error.message.includes("JWT")) return toSignIn();
    return { ok: false };
  }
  return { ok: true };
}
