// Supabase Auth's rate limits: HTTP 429 or an over_* error code
// (over_email_send_rate_limit, over_request_rate_limit, …).
export function isRateLimit(error: { code?: string; status?: number }): boolean {
  return error.status === 429 || (error.code ?? "").startsWith("over_");
}

// An Auth answer the page can only call "Something went wrong": what it was,
// for the server log. Its kind only, never its message, the address or the
// password. A bad API key has no code, only a name and a status, so all three.
export function logAuthFailure(where: string, error: { name?: string; status?: number; code?: string }): void {
  console.error(`auth failure: ${where}`, { name: error.name, status: error.status, code: error.code });
}
