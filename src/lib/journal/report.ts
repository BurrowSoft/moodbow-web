// "Your week" on the web (1.1 D, decision 173): the report edge function's
// answers (content/contracts/report.md) mapped to what Insights shows.
// The server picks the week (the last complete Monday–Sunday in the
// profile's zone); the client only needs that Monday to read a stored one.

export type ReportSections = { changed: string; went_well: string; notice: string; idea?: string };
export type ReportBody = { sections: ReportSections } | { crisis: string };
export type WeeklyReport = { id: string; week_start: string; body: ReportBody; tier: "full" | "lite"; created_at: string };

export type ReportResult =
  | { status: "ok"; report: WeeklyReport; balance: number | null }
  // The same tap is still running: ask again with the same key in ~2 s.
  | { status: "in_progress" }
  // AI is off for everyone right now (ai_disabled): hide Your week.
  | { status: "hidden" }
  // No answer from the function: only a retry with the SAME key is safe.
  | { status: "no_answer" }
  | { status: "error"; message: ReportErrorKey };

// Copy keys in the "ai" namespace.
export type ReportErrorKey = "reportNotEnough" | "reportError" | "dailyLimit" | "errRateLimited" | "meAiOffHint";

const str = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

// A body as stored or returned, or null if it isn't one of the two shapes
// (report.md: {sections: {changed, went_well, notice, idea?}} or {crisis}).
export function parseReportBody(raw: unknown): ReportBody | null {
  const b = (typeof raw === "string" ? safeJson(raw) : raw) as { sections?: Record<string, unknown>; crisis?: unknown } | null;
  if (!b || typeof b !== "object") return null;
  if (str(b.crisis)) return { crisis: b.crisis };
  const s = b.sections;
  if (!s || !str(s.changed) || !str(s.went_well) || !str(s.notice)) return null;
  return { sections: { changed: s.changed, went_well: s.went_well, notice: s.notice, ...(str(s.idea) ? { idea: s.idea } : {}) } };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export const isCrisis = (b: ReportBody): b is { crisis: string } => "crisis" in b;

// The Monday that starts the last complete week before `today` (YYYY-MM-DD,
// the profile's today): this week's Monday, minus 7 days.
export function lastWeekStart(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday - 7);
  return d.toISOString().slice(0, 10);
}

// report.md, Errors (401 is the caller's: sign in again).
export function reportOutcome(code: unknown): Exclude<ReportResult, { status: "ok" }> {
  switch (code) {
    case "in_progress":
      return { status: "in_progress" };
    case "ai_disabled":
      return { status: "hidden" };
    case "not_enough":
      return { status: "error", message: "reportNotEnough" };
    case "ai_consent_required":
      return { status: "error", message: "meAiOffHint" };
    case "rate_limited":
      return { status: "error", message: "errRateLimited" };
    case "daily_limit":
      return { status: "error", message: "dailyLimit" };
    // report_failed, invalid_value (a week boundary passed mid-request: a
    // new tap asks again), ai_budget_exhausted and anything new.
    default:
      return { status: "error", message: "reportError" };
  }
}
