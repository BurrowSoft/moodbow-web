// "Reflect with Moodbow" on the web (M9): the reflect edge function's
// answers (content/contracts/reflect.md) mapped to what the page shows.

export type Reflection = { id: string; body: string; tier: "full" | "lite"; created_at: string };

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
