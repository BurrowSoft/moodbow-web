// "Reflect with Moodbow" on the web (M9): the reflect edge function's
// answers (content/contracts/reflect.md) mapped to what the page shows.
import getHelpLabel from "../../../content/contracts/get-help-label.json";
import { normalizeForCrisis } from "@/lib/safety/crisis";

export type Reflection = { id: string; body: string; tier: "full" | "lite"; created_at: string };

// A crisis reply (decision 124): it names the help button. The reply is in the entry's language, which
// may not be the UI's, so any label in the shared contract counts (reviewer #35). Both sides go through
// the crisis normalizer, as on the app (namesHelpLabel): a no-break space, a curly apostrophe, a missing
// ? or ¿, or the case can't hide the button. One rule for both places: the entry's panel shows the
// button itself, and Insights → AI's list shows only the date and a neutral word (decision 258).
const forMatch = (s: string) => normalizeForCrisis(s, false);
const GET_HELP_LABELS = Object.values(getHelpLabel.labels).map(forMatch).filter(Boolean);
export function namesGetHelp(body: string): boolean {
  const reply = forMatch(body);
  return GET_HELP_LABELS.some((label) => reply.includes(label));
}

// What one call of the reflect server action came back with.
export type ReflectResult =
  | { status: "ok"; reflection: Reflection; balance: number | null }
  // The same tap (client_key), or another reflection of this entry, is still
  // running: ask again with the same key in ~2 s.
  | { status: "in_progress" }
  // AI is off for everyone right now (ai_disabled): hide Reflect.
  | { status: "hidden" }
  // No answer from the function (unreachable, or a gateway error without
  // the contract's {error} code): it may have run, so only a retry with the
  // SAME client_key is safe (reflect.md; reviewer #34). Shown as errOffline.
  | { status: "no_answer" }
  | { status: "error"; message: ReflectErrorKey };

// Copy keys in the "ai" namespace.
export type ReflectErrorKey = "reflectError" | "dailyLimit" | "errRateLimited" | "meAiOffHint";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

// reflect.md, Errors (401 is handled by the caller: the usual session
// handling, i.e. sign in again).
export function reflectOutcome(code: unknown): Exclude<ReflectResult, { status: "ok" }> {
  switch (code) {
    case "in_progress":
      return { status: "in_progress" };
    case "ai_disabled":
      return { status: "hidden" };
    case "ai_consent_required":
      return { status: "error", message: "meAiOffHint" };
    case "rate_limited":
      return { status: "error", message: "errRateLimited" };
    case "daily_limit":
      return { status: "error", message: "dailyLimit" };
    // invalid_value, not_found, ai_budget_exhausted, reflect_failed, and
    // anything new: the friendly error ("…Your entry is saved.").
    default:
      return { status: "error", message: "reflectError" };
  }
}

// How long one tap keeps asking while the server says in_progress
// (reflect.md: retry the same client_key after ~2 s, up to ~30 s).
export const IN_PROGRESS_RETRY_MS = 2_000;
export const IN_PROGRESS_LIMIT_MS = 30_000;

// How long one call may take before it counts as no answer (the same key
// is then safe to resend; reflect.md). The server gives the function 45 s;
// the browser gives the whole server action 55 s, in case the request
// between them hangs (Web Tester, #35: a held call showed "Reading your
// entry…" forever).
export const REFLECT_SERVER_DEADLINE_MS = 45_000;
export const REFLECT_CLIENT_DEADLINE_MS = 55_000;
