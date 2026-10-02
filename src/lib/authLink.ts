// Supabase sends confirmation links that failed (expired, already used) to
// the redirect URL with error details in the fragment (#error=…&error_code=
// otp_expired) or, for some flows, in the query string. Successful links
// arrive clean, with tokens, or with ?code=. Only the presence of an error
// key matters; its value is never shown or logged.
export type AuthLinkResult = "ok" | "error";

export function classifyAuthLink(search: string, hash: string): AuthLinkResult {
  const params = [new URLSearchParams(search), new URLSearchParams(hash.replace(/^#/, ""))];
  return params.some((p) => p.has("error") || p.has("error_code")) ? "error" : "ok";
}
