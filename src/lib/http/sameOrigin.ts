// A route handler has no server action's origin check: a POST from a page must
// come from this host, the public host the browser asked for (x-forwarded-host
// / host, as Vercel passes them; req.url as a fallback). A missing, "null"
// (sandboxed frames, some redirects) or malformed Origin is refused, never a
// crash (Reviewer #166).
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// The page's origin, once sameOrigin passed: where Stripe sends the person back.
export const pageOrigin = (req: Request): string => new URL(req.headers.get("origin")!).origin;
