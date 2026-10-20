// The Content-Security-Policy (reviewer's audit A1): scripts only from us,
// each page's own inline scripts by a per-request nonce (Next reads it from
// the request's CSP header and stamps its scripts; the pre-paint theme
// script takes it from x-nonce), and connections only to us, Supabase and
// Sentry. Report-Only until "csp-enforced" is met (after a clean Preview run
// of every page, read from the browser console). No report-uri: a report
// carries the full page address, query included, past our scrubbing, and
// /auth/confirm's carries a single-use token (reviewer #69).

export const NONCE_HEADER = "x-nonce";

type CspEnv = {
  supabaseUrl?: string;
  sentryDsn?: string;
  // Vercel Previews load Vercel's toolbar (vercel.live).
  vercelEnv?: string;
};

const origin = (url: string | undefined): string | null => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};

export function buildCsp(nonce: string, { supabaseUrl, sentryDsn, vercelEnv }: CspEnv): string {
  const supabase = origin(supabaseUrl);
  const sentry = origin(sentryDsn);
  const preview = vercelEnv === "preview";
  const connect = ["'self'"];
  if (supabase) connect.push(supabase, supabase.replace(/^https:/, "wss:"));
  if (sentry) connect.push(sentry);
  if (preview) connect.push("https://vercel.live", "wss://ws-us3.pusher.com");
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    // 'strict-dynamic': scripts our nonced scripts load (Next's chunks) are trusted too.
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(preview ? ["https://vercel.live"] : [])]],
    // Inline style attributes (React style={…}, the arc's delays) can't carry a nonce.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // data: and blob: for the share card's canvas preview and download.
    ["img-src", ["'self'", "data:", "blob:", ...(preview ? ["https://vercel.live", "https://vercel.com"] : [])]],
    ["font-src", ["'self'"]],
    ["connect-src", connect],
    ["frame-src", preview ? ["https://vercel.live"] : ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["manifest-src", ["'self'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

// A fresh nonce per request (128 random bits, base64).
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
