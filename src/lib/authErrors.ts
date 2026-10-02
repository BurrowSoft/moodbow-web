// Supabase Auth's rate limits: HTTP 429 or an over_* error code
// (over_email_send_rate_limit, over_request_rate_limit, …).
export function isRateLimit(error: { code?: string; status?: number }): boolean {
  return error.status === 429 || (error.code ?? "").startsWith("over_");
}
