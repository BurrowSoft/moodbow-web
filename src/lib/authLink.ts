// What /email-confirmed shows. Two sources:
// - /auth/confirm redirects here with ?result=expired or
//   ?result=email_changed (and nothing for a confirmed signup);
// - Supabase's own redirect links (before the send-email hook, or a flow
//   that bypasses it) put error details in the fragment
//   (#error=…&error_code=otp_expired) or the query string.
// Only the presence of an error key matters; its value is never shown or
// logged.
export type AuthLinkResult = "ok" | "error" | "email_changed" | "email_change_pending";

export function classifyAuthLink(search: string, hash: string): AuthLinkResult {
  const query = new URLSearchParams(search);
  const params = [query, new URLSearchParams(hash.replace(/^#/, ""))];
  if (query.get("result") === "expired" || params.some((p) => p.has("error") || p.has("error_code"))) return "error";
  const result = query.get("result");
  if (result === "email_changed" || result === "email_change_pending") return result;
  return "ok";
}

// The only query /email-confirmed keeps: ?result=<what to show>, or none
// for a plain confirmation. Anything else (Supabase's ?code=, error
// details) is dropped by the proxy before the page renders, so it never
// reaches the page's props or its RSC payload (Web Tester's note, #9).
export function canonicalEmailConfirmedSearch(search: string): string {
  const result = classifyAuthLink(search, "");
  return result === "ok" ? "" : `?result=${result === "error" ? "expired" : result}`;
}
