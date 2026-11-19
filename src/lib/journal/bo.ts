// Bo, Moodbow's AI: the web's side of supabase/contracts/bo.md. One function, `bo`,
// for app and web; on the web it's only ever called from our server, with the
// person's session and a region token signed there, so neither reaches a browser
// directly. `show_help` and `open_card` say a turn was flagged: they're never stored
// or logged, on either side, and stay out of Sentry (rule 6(e)). Nothing here logs
// any text.

// The contract's worst case is about 56 s, and clients wait 60. The server's own
// wait ends a moment before the browser's, and the route's maxDuration above both.
export const BO_CLIENT_WAIT_MS = 60_000;

// Bo's languages, until others are evaluated (decision 239): checked on both clients and the
// server, so offering a new language can't turn on an unevaluated Bo. Data locales (pt for pt-BR).
export const BO_LANGUAGES = ["en", "es", "fr", "pt"] as const;
export const boLanguage = (route: string) => (route === "pt-br" ? "pt" : route);
export const boSpeaks = (route: string) => (BO_LANGUAGES as readonly string[]).includes(boLanguage(route));
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
  "bo_not_available",
  "language_off",
  "age_off",
  "bo_off",
  "bo_failed",
] as const;
export type BoError = (typeof BO_ERRORS)[number];

// Every error renders with help on screen. no_answer: offline, a gateway's own page
// or a timeout, so the client's fixed text, with help and Retry; the same client_key
// is resent, and the function replays the stored answer if it had finished.
// helpCountry (status and send): the region token's country once the server verified it, two
// capital letters, else absent. The card shows its numbers first (UX, 2026-11-09; bo.md).
export type BoSend = { status: "ok"; reply: string; showHelp: boolean; openCard: boolean; showNotice: boolean; conversationFull: boolean; helpCountry?: string } | { status: "error"; code: BoError } | { status: "no_answer" };
// Why Bo isn't available: the first switch that says no, in the contract's order (bo.md).
export const BO_REASONS = ["off", "region_off", "region_unknown", "language_off", "age", "budget", "bo_off", "consent"] as const;
export type BoReason = (typeof BO_REASONS)[number];
// picturesLimit: no pictures now only because today's are used up (024, pictures_reason). The
// screen says so where attach would be; every other no stays silent (UX, 2026-11-09).
export type BoStatus = { status: "ok"; available: boolean; reason: BoReason | null; pictures: boolean; picturesLimit?: true; maxChars: number; helpCountry?: string } | { status: "error"; code: BoError } | { status: "no_answer" };

// Only ever a country the server verified, and only in the contract's shape.
export const boHelpCountry = (c: unknown): { helpCountry?: string } => (typeof c === "string" && /^[A-Z]{2}$/.test(c) ? { helpCountry: c } : {});

// What each reason shows (bo.md's Client column): the button only where Bo is available, its
// budget is spent (the line, with help) or it needs consent (the button opens consent).
export const boButtonShows = (s: BoStatus) => s.status === "ok" && (s.available || s.reason === "budget" || s.reason === "consent");
// Me can offer Bo back where the only no is the person's own, or one Bo's screen explains.
export const boCanTurnOn = (s: BoStatus) => s.status === "ok" && (s.available || s.reason === "budget" || s.reason === "bo_off" || s.reason === "consent");
// On Bo's screen, a reason is the same stop as its error on send. Consent is the page's own step.
export const boReasonProblem = (reason: BoReason | null): BoError | null =>
  reason === null || reason === "consent" ? null : reason === "off" || reason === "budget" ? "bo_not_available" : reason === "age" ? "age_off" : reason;

export const isBoError = (code: unknown): code is BoError => typeof code === "string" && (BO_ERRORS as readonly string[]).includes(code);

// An unknown code isn't the function's contract: treat it as no answer, never as a
// reason to show something it didn't say.
export const boErrorOutcome = (code: unknown): { status: "error"; code: BoError } | { status: "no_answer" } => (isBoError(code) ? { status: "error", code } : { status: "no_answer" });

export function parseBoSend(data: unknown): BoSend {
  const d = (data ?? {}) as Record<string, unknown>;
  // Plain text only, as the contract says; a reply that isn't one is never shown.
  if (typeof d.reply !== "string" || d.reply === "") return { status: "no_answer" };
  return { status: "ok", reply: d.reply, showHelp: d.show_help === true, openCard: d.open_card === true, showNotice: d.show_notice === true, conversationFull: d.conversation_full === true, ...boHelpCountry(d.help_country) };
}

export function parseBoStatus(data: unknown): BoStatus {
  const d = (data ?? {}) as { available?: unknown; reason?: unknown; pictures?: unknown; pictures_reason?: unknown; help_country?: unknown; limits?: { max_chars?: unknown } };
  if (typeof d.available !== "boolean") return { status: "no_answer" };
  // A no without a reason this client knows is read as off: never more than the function said.
  const reason = d.available ? null : (BO_REASONS as readonly unknown[]).includes(d.reason) ? (d.reason as BoReason) : "off";
  const picturesLimit = d.pictures !== true && d.pictures_reason === "picture_limit";
  return { status: "ok", available: d.available, reason, pictures: d.pictures === true, ...(picturesLimit ? { picturesLimit: true as const } : {}), maxChars: typeof d.limits?.max_chars === "number" ? d.limits.max_chars : 2000, ...boHelpCountry(d.help_country) };
}

// What this screen needs of a conversation: kept messages only, as plain text.
// sentWith: a reply from this visit, found by its send's key; unkept: past the row cap.
// hasPicture: a kept message that came with a picture, which isn't stored or returned.
// pictureUrl: this visit's own copy, in memory, gone with the screen.
export type BoMessage = { id: string; author: "person" | "ai"; body: string; sentWith?: string; unkept?: boolean; hasPicture?: boolean; pictureUrl?: string };
export type BoProblem = BoError | "no_answer" | "offline";

export const BO_HISTORY_SHOWN = 200;
export const BO_DEFAULT_MAX_CHARS = 2000;
export const BO_WAIT_RETRY_MS = 2000;

// The card reopens on each match unless it opened in the last 10 minutes (UX).
const BO_CARD_QUIET_MS = 10 * 60_000;
export const boCardMayOpen = (openedAt: number | null, now: number) => openedAt === null || now - openedAt >= BO_CARD_QUIET_MS;

// The line for each stop. The web has no anonymous sessions, so needs_email is
// neutral here, and pictures_need_email only reads as pictures being off.
export const BO_ERROR_TEXT = {
  invalid_value: "tooLong",
  not_authenticated: "failed",
  ai_consent_required: "failed",
  region_off: "regionOff",
  // "Right now", never "this account", which read as blame (UX, 2026-11-08).
  bo_unavailable: "notAvailableNow",
  needs_email: "notAvailableNow",
  pictures_off: "picturesOff",
  pictures_need_email: "picturesOff",
  in_progress: "wait",
  rate_limited: "wait",
  daily_limit: "dailyLimit",
  picture_limit: "pictureLimit",
  region_unknown: "regionUnknown",
  bo_not_available: "notAvailableNow",
  language_off: "languageOff",
  age_off: "ageOff",
  bo_off: "boOff",
  bo_failed: "failed",
  no_answer: "failed",
  offline: "offline",
} as const satisfies Record<BoProblem, string>;

// The picture field as the function expects it, or nothing. bo.md takes at most 1 MB
// decoded (app b67431e); the browser makes at most 1,000,000 bytes (boPicture.ts), which
// is this many base64 characters, so nothing bigger is passed on to be refused there.
export const BO_PICTURE_MAX_BASE64 = Math.ceil(1_000_000 / 3) * 4;
export function boPictureField(value: unknown): { media_type: "image/jpeg"; data: string } | null {
  const v = (value ?? {}) as { media_type?: unknown; data?: unknown };
  if (v.media_type !== "image/jpeg" || typeof v.data !== "string" || v.data === "" || v.data.length > BO_PICTURE_MAX_BASE64) return null;
  return { media_type: "image/jpeg", data: v.data };
}

// The kept conversation from bo_messages (newest first, as read), oldest first for the screen.
// A message that came with a picture keeps only that fact (has_picture): it shows "(photo)".
export function historyFromRows(rows: unknown): BoMessage[] {
  return (Array.isArray(rows) ? rows : [])
    .filter((r): r is { id: string; author: "person" | "ai"; body: string; has_picture?: unknown } => typeof r?.id === "string" && (r?.author === "person" || r?.author === "ai") && typeof r?.body === "string")
    .map(({ id, author, body, has_picture }) => ({ id, author, body, hasPicture: has_picture === true }))
    .reverse();
}
