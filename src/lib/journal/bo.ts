// Bo, Moodbow's AI: the web's side of supabase/contracts/bo.md. One function, `bo`,
// for app and web; on the web it's only ever called from our server, with the
// person's session and a region token signed there, so neither reaches a browser
// directly. `show_help` and `open_card` say a turn was flagged: they're never stored
// or logged, on either side, and stay out of Sentry (rule 6(e)). Nothing here logs
// any text.

// The contract's worst case is about 56 s, and clients wait 60. The server's own
// wait ends a moment before the browser's, and the route's maxDuration above both.
export const BO_CLIENT_WAIT_MS = 60_000;
export const BO_SERVER_WAIT_MS = 58_000;

export const BO_ERRORS = [
  "invalid_value",
  "not_authenticated",
  "ai_consent_required",
  "region_off",
  "bo_unavailable",
  "needs_email",
  "pictures_off",
  "pictures_need_email",
  "in_progress",
  "rate_limited",
  "daily_limit",
  "picture_limit",
  "region_unknown",
  "bo_resting",
  "bo_failed",
] as const;
export type BoError = (typeof BO_ERRORS)[number];

// Every error renders with help on screen. no_answer: offline, a gateway's own page
// or a timeout, so the client's fixed text, with help and Retry; the same client_key
// is resent, and the function replays the stored answer if it had finished.
export type BoSend = { status: "ok"; reply: string; showHelp: boolean; openCard: boolean; showNotice: boolean; conversationFull: boolean } | { status: "error"; code: BoError } | { status: "no_answer" };
export type BoStatus = { status: "ok"; available: boolean; pictures: boolean; maxChars: number } | { status: "error"; code: BoError } | { status: "no_answer" };

export const isBoError = (code: unknown): code is BoError => typeof code === "string" && (BO_ERRORS as readonly string[]).includes(code);

// An unknown code isn't the function's contract: treat it as no answer, never as a
// reason to show something it didn't say.
export const boErrorOutcome = (code: unknown): { status: "error"; code: BoError } | { status: "no_answer" } => (isBoError(code) ? { status: "error", code } : { status: "no_answer" });

export function parseBoSend(data: unknown): BoSend {
  const d = (data ?? {}) as Record<string, unknown>;
  // Plain text only, as the contract says; a reply that isn't one is never shown.
  if (typeof d.reply !== "string" || d.reply === "") return { status: "no_answer" };
  return { status: "ok", reply: d.reply, showHelp: d.show_help === true, openCard: d.open_card === true, showNotice: d.show_notice === true, conversationFull: d.conversation_full === true };
}

export function parseBoStatus(data: unknown): BoStatus {
  const d = (data ?? {}) as { available?: unknown; pictures?: unknown; limits?: { max_chars?: unknown } };
  if (typeof d.available !== "boolean") return { status: "no_answer" };
  return { status: "ok", available: d.available, pictures: d.pictures === true, maxChars: typeof d.limits?.max_chars === "number" ? d.limits.max_chars : 2000 };
}
