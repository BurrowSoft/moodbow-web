import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Staging-only helpers for the launch journeys. Rules (UX & PM, 1.0):
// - the STAGING project only: anything else throws before a single call;
// - throwaway users e2e-ci-<run>-<n>@example.invalid, a random password per
//   run, never printed; each test deletes what it made, and every run first
//   sweeps e2e-ci-* users a crashed run left behind (older than 2 h);
// - no env value is ever logged.
// Env (CI: repo secrets, only given to the journeys job's test step):
// SUPABASE_STAGING_URL, SUPABASE_STAGING_PUBLISHABLE_KEY (also baked into
// that job's build as NEXT_PUBLIC_*), SUPABASE_STAGING_SECRET_KEY (the admin
// API: confirm and delete; never in the build).
export const STAGING_REF = "mnmkkrqponzlenvxiutd";
const URL_ = process.env.SUPABASE_STAGING_URL ?? "";
const SECRET = process.env.SUPABASE_STAGING_SECRET_KEY ?? "";
const PUBLISHABLE = process.env.SUPABASE_STAGING_PUBLISHABLE_KEY ?? "";

export const configured = URL_ !== "" && SECRET !== "" && PUBLISHABLE !== "";
export const notConfigured = "the staging secrets aren't set (SUPABASE_STAGING_URL, _PUBLISHABLE_KEY, _SECRET_KEY): journeys skipped";

if (URL_ && new URL(URL_).hostname !== `${STAGING_REF}.supabase.co`) {
  throw new Error("journeys refuse this Supabase project: staging only");
}

const PREFIX = "e2e-ci-";
const RUN = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
let n = 0;
export const newEmail = () => `${PREFIX}${RUN}-${++n}@example.invalid`;
export const newPassword = () => `${randomBytes(18).toString("base64url")}aA1!`;

let client: SupabaseClient | null = null;
const admin = () => (client ??= createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })).auth.admin;

// Only ever touches users this helper's naming made.
const ours = (email: string | undefined) => !!email && email.startsWith(PREFIX) && email.endsWith("@example.invalid");

async function* users() {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin().listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    yield* data.users;
    if (data.users.length < 1000) return;
  }
}

export async function userId(email: string): Promise<string | null> {
  for await (const u of users()) if (u.email === email) return u.id;
  return null;
}

// Confirms the address (as the email link would) without a mailbox.
export async function confirmEmail(email: string): Promise<void> {
  const id = await userId(email);
  if (!id) throw new Error("the signed-up user isn't on staging");
  const { error } = await admin().updateUserById(id, { email_confirm: true });
  if (error) throw new Error(`confirm failed: ${error.message}`);
}

export async function exists(email: string): Promise<boolean> {
  return (await userId(email)) !== null;
}

// Deletes the user if it's still there (the journey may have deleted it).
export async function cleanup(email: string): Promise<void> {
  if (!ours(email)) throw new Error("cleanup only deletes e2e-ci-* users");
  const id = await userId(email);
  if (id) await admin().deleteUser(id);
}

// Users a crashed run left behind (older than 2 h, so a parallel run's are safe).
export async function sweep(): Promise<number> {
  const cutoff = Date.now() - 2 * 3600_000;
  const stale: string[] = [];
  for await (const u of users()) if (ours(u.email) && Date.parse(u.created_at) < cutoff) stale.push(u.id);
  for (const id of stale) await admin().deleteUser(id);
  return stale.length;
}

// Whether staging offers AI to this user right now, read as the app reads it
// (get_me().ai_available, as the signed-in user; the global switch is off
// outside AI windows).
export async function aiAvailable(email: string, password: string): Promise<boolean> {
  const user = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await user.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign-in for get_me failed: ${signInError.message}`);
  const { data, error } = await user.rpc("get_me");
  await user.auth.signOut({ scope: "local" });
  if (error) throw new Error(`get_me failed: ${error.message}`);
  return (data as { ai_available?: boolean } | null)?.ai_available === true;
}
