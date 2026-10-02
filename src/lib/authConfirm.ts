import type { EmailOtpType } from "@supabase/supabase-js";

// The links in Moodbow's auth emails (the send-email hook, moodbow-app #5):
// /auth/confirm?token_hash=…&type=… . The route verifies the token
// server-side (so the link works on any device, not only the one that
// asked for it), then redirects to a clean URL so the token never stays in
// the address bar, history or a referrer. redirect_to is never followed.

export const CONFIRM_TYPES = ["signup", "invite", "magiclink", "email", "recovery", "email_change"] as const satisfies readonly EmailOtpType[];
export type ConfirmType = (typeof CONFIRM_TYPES)[number];

// Supabase token hashes are hex (optionally prefixed, e.g. pkce_); anything
// else is rejected before it reaches the API.
const TOKEN_HASH = /^[A-Za-z0-9_-]{8,512}$/;

export function parseConfirmLink(params: URLSearchParams): { tokenHash: string; type: ConfirmType } | null {
  const tokenHash = params.get("token_hash") ?? "";
  const type = params.get("type") ?? "";
  if (!TOKEN_HASH.test(tokenHash)) return null;
  if (!(CONFIRM_TYPES as readonly string[]).includes(type)) return null;
  return { tokenHash, type: type as ConfirmType };
}

// Where each outcome lands (paths without the locale prefix).
export type ConfirmTarget = { path: string; result?: "email_changed" | "email_change_pending" | "expired" };

export const CONFIRM_FAILED: ConfirmTarget = { path: "/email-confirmed", result: "expired" };

// sessionCreated: verifyOtp returned a session. An email change asks for
// both addresses to confirm (Supabase secure email change): the first link
// succeeds without a session and without changing anything yet, so it must
// not say "updated" (text = enforcement).
export function confirmTarget(type: ConfirmType, sessionCreated: boolean): ConfirmTarget {
  switch (type) {
    case "recovery":
      return { path: "/auth/reset-password" };
    case "email_change":
      return { path: "/email-confirmed", result: sessionCreated ? "email_changed" : "email_change_pending" };
    default:
      return { path: "/email-confirmed" };
  }
}

// Recovery needs the session (to set the new password); every other link
// only confirms something, so the web session it creates is ended right
// away while the web journal isn't live.
export function keepsSession(type: ConfirmType, webJournalLive: boolean): boolean {
  return type === "recovery" || webJournalLive;
}
