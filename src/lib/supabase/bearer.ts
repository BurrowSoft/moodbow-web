import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DATA_DEADLINE_MS } from "./deadline";
import { supabaseConfig } from "./server";

// A request from the app, signed with the person's own access token (Authorization: Bearer <jwt>),
// for the few web endpoints the app calls (the Reviewer's payments audit, 14 Nov). The token is
// checked with Supabase Auth (getUser), and the client it gives back carries it, so every read is
// the person's own under RLS. Never a service-role key. No cookies are read or set.
export type BearerUser =
  | { kind: "ok"; client: SupabaseClient; uid: string }
  | { kind: "missing" | "invalid" | "outage" | "not_configured" };

export function bearerToken(req: Request): string | null {
  // The scheme's name is case-insensitive (RFC 9110); the token is a JWT's characters only.
  const m = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(req.headers.get("authorization")?.trim() ?? "");
  return m ? m[1] : null;
}

// Each call gives up after the usual data deadline (a dead connection never holds the route).
const fetchWithDeadline: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(DATA_DEADLINE_MS) });

export async function bearerUser(req: Request): Promise<BearerUser> {
  const token = bearerToken(req);
  if (!token) return { kind: "missing" };
  const config = supabaseConfig();
  if (!config) return { kind: "not_configured" };
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: fetchWithDeadline },
  });
  try {
    const { data, error } = await client.auth.getUser(token);
    if (data?.user?.id) return { kind: "ok", client, uid: data.user.id };
    // Auth unreachable or slow: not the person's fault, and never read as "signed out".
    if (error && (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500)) return { kind: "outage" };
    return { kind: "invalid" };
  } catch {
    return { kind: "outage" };
  }
}
