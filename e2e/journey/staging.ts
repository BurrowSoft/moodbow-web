import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { consentItem } from "../../src/lib/legalVersions";
import { lastWeekStart } from "../../src/lib/journal/report";
import { grantedAtConsent } from "../../src/lib/onboardingConsent";

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
const database = () => createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = () => (client ??= createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })).auth.admin;

// Only ever touches users this helper's naming made.
const ours = (email: string | undefined) => !!email && email.startsWith(PREFIX) && email.endsWith("@example.invalid");
// The users this run itself created, and those it gave a Plus row: an entitlements row is only
// ever written for one of the first, and checked gone after its cleanup (UX and the Mobile Dev,
// 12 Nov: every other row is the Mobile Dev's, by exact id).
const createdHere = new Set<string>();
const grantedHere = new Map<string, string>();

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

// The account the sign-up form makes (profile and consents, through the auth
// trigger), still unconfirmed, without the form's email: staging rate-limits
// those, and only the journeys above need the form itself. Returns the token
// the email link would carry, for the real /auth/confirm page. Without
// consents, the account still owes Consent. locale: the language it's saved with.
export async function signedUpUnconfirmed(email: string, password: string, { consents = true, locale = "en" } = {}): Promise<string> {
  const { data, error } = await admin().generateLink({
    type: "signup",
    email,
    password,
    options: { data: { locale, time_zone: "UTC", ...(consents ? { consents: [...grantedAtConsent(), consentItem("age_18")] } : {}) } },
  });
  if (error) throw new Error(`generateLink failed: ${error.message}`);
  createdHere.add(email);
  return data.properties.hashed_token;
}

// A confirmed account with no consents recorded yet.
export async function createConfirmedUser(email: string, password: string): Promise<void> {
  const { error } = await admin().createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  createdHere.add(email);
}

// Ends every session of this user, as "sign out everywhere" on another device does.
export async function revokeSessions(email: string, password: string): Promise<void> {
  const user = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await user.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign-in to revoke failed: ${signInError.message}`);
  const { error } = await user.auth.signOut({ scope: "global" });
  if (error) throw new Error(`revoke failed: ${error.message}`);
}

// Saves a language on the profile, the way Me → Language does: as the user,
// through update_profile (the table takes no direct writes, even from the admin key).
export async function setProfileLocale(email: string, password: string, locale: string): Promise<void> {
  const user = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await user.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign-in to save a language failed: ${signInError.message}`);
  const { error } = await user.rpc("update_profile", { p_locale: locale });
  if (error) throw new Error(`saving the language failed: ${error.message}`);
}

// The same, signed in once, for a test that saves many times.
export async function profileSaver(email: string, password: string): Promise<(fields: { p_locale: string } | { p_country: string }) => Promise<void>> {
  const user = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await user.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign-in to save a profile failed: ${signInError.message}`);
  return async (fields) => {
    const { error } = await user.rpc("update_profile", fields);
    if (error) throw new Error(`saving the profile failed: ${error.message}`);
  };
}

// The person's today, as the journal has it.
export async function journalToday(email: string, password: string): Promise<string> {
  const user = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await user.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign-in failed: ${signInError.message}`);
  const { data, error } = await user.rpc("get_me");
  if (error) throw new Error(`get_me failed: ${error.message}`);
  return (data as { today: string }).today;
}

// The Monday of the person's last complete week, in their saved time zone, and a
// week's check-ins for it (Your week): the form would take a week of real days.
// offsets: days after that Monday. Replaces any on those days.
export async function lastWeekMonday(email: string): Promise<string> {
  const id = await userId(email);
  const { data, error } = await database().from("profiles").select("time_zone").eq("user_id", id).maybeSingle();
  if (error) throw new Error(`reading the time zone failed: ${error.message}`);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: data?.time_zone ?? "UTC" }).format(new Date());
  return lastWeekStart(today);
}

export async function seedCheckIns(email: string, password: string, monday: string, days: { offset: number; mood: number; sleep_hours?: number }[]): Promise<void> {
  if (!ours(email)) throw new Error("seedCheckIns only touches this helper's own users");
  // Through the app's own RPC, signed in as them: the service role has no write on
  // check_ins (staging, #201).
  const user = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await user.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign-in to seed check-ins failed: ${signInError.message}`);
  for (const { offset, mood, sleep_hours } of days) {
    const d = new Date(`${monday}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    const { error } = await user.rpc("upsert_check_in", {
      p_date: d.toISOString().slice(0, 10),
      p_mood: mood,
      p_sleep_hours: sleep_hours ?? null,
      p_sleep_quality: null,
      p_exercise_minutes: null,
      p_stress: null,
      p_expected_updated_at: null,
      p_insert_only: false,
    });
    if (error) throw new Error(`seeding check-ins failed: ${error.message}`);
  }
}

// Tags on seeded days (029), through the app's own RPC, signed in as them, as seedCheckIns. false:
// staging has no tags yet (set_check_in_tags missing), so the caller can skip, never fake it.
export async function seedTags(email: string, password: string, monday: string, days: { offset: number; tags: string[] }[]): Promise<boolean> {
  if (!ours(email)) throw new Error("seedTags only touches this helper's own users");
  const user = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await user.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign-in to seed tags failed: ${signInError.message}`);
  for (const { offset, tags } of days) {
    const d = new Date(`${monday}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    const { error } = await user.rpc("set_check_in_tags", { p_date: d.toISOString().slice(0, 10), p_tags: tags });
    if (error?.code === "PGRST202") return false;
    if (error) throw new Error(`seeding tags failed: ${error.message}`);
  }
  return true;
}

// Whether the account holds a granted AI consent, as get_me says.
export async function aiConsentGranted(email: string, password: string): Promise<boolean> {
  const user = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await user.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign-in failed: ${signInError.message}`);
  const { data, error } = await user.rpc("get_me");
  if (error) throw new Error(`get_me failed: ${error.message}`);
  return (data as { consents?: { ai?: { granted?: boolean } } }).consents?.ai?.granted === true;
}

// The token a password reset email would carry.
export async function recoveryLinkHash(email: string): Promise<string> {
  const { data, error } = await admin().generateLink({ type: "recovery", email });
  if (error) throw new Error(`generateLink failed: ${error.message}`);
  return data.properties.hashed_token;
}

// The language the profile holds.
export async function profileLocale(email: string): Promise<string | null> {
  const id = await userId(email);
  const db = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.from("profiles").select("locale").eq("user_id", id).maybeSingle();
  if (error) throw new Error(`reading the profile failed: ${error.message}`);
  return data?.locale ?? null;
}

export async function exists(email: string): Promise<boolean> {
  return (await userId(email)) !== null;
}

// Pictures (035): whether staging has the bucket and table yet (the picture journeys skip before).
export async function picturesOnStaging(): Promise<boolean> {
  if (!configured) return false;
  const { error } = await database().from("entry_pictures").select("id").limit(1);
  return !error;
}

// A moment written through the app's own RPC, signed in as them (the service role has no write on
// entries). Returns its id.
export async function seedMoment(email: string, password: string, date: string, body: string): Promise<string> {
  if (!ours(email)) throw new Error("seedMoment only touches this helper's own users");
  const user = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await user.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign-in to seed a moment failed: ${signInError.message}`);
  const { data, error } = await user.rpc("save_entry", { p_id: null, p_date: date, p_body: body, p_is_moment: true, p_expected_updated_at: null });
  await user.auth.signOut({ scope: "local" });
  if (error) throw new Error(`seeding a moment failed: ${error.message}`);
  return (data as { id: string }).id;
}

// This run's own user's stored picture files (name and bytes), read back with the service role.
export async function pictureFiles(email: string): Promise<{ name: string; bytes: Buffer }[]> {
  if (!ours(email)) throw new Error("pictureFiles only reads this helper's own users");
  const id = await userId(email);
  if (!id) return [];
  const bucket = database().storage.from("entry-pictures");
  const out: { name: string; bytes: Buffer }[] = [];
  const { data: entries } = await bucket.list(id);
  for (const entry of entries ?? []) {
    const { data: files } = await bucket.list(`${id}/${entry.name}`);
    for (const f of files ?? []) {
      const name = `${id}/${entry.name}/${f.name}`;
      const { data: blob, error } = await bucket.download(name);
      if (error || !blob) throw new Error(`reading back ${f.name} failed`);
      out.push({ name, bytes: Buffer.from(await blob.arrayBuffer()) });
    }
  }
  return out;
}

// Deletes the user if it's still there (the journey may have deleted it).
export async function cleanup(email: string): Promise<void> {
  if (!ours(email)) throw new Error("cleanup only deletes e2e-ci-* users");
  const id = await userId(email);
  // Pictures (035): the files of this run's user go through the Storage API now (Preview runs no
  // cron), and their queue rows after the user (the rows' trigger queues them on the cascade).
  const pictures = id ? (await pictureFiles(email)).map((f) => f.name) : [];
  if (pictures.length > 0) await database().storage.from("entry-pictures").remove(pictures);
  if (id) await admin().deleteUser(id);
  if (id && pictures.length > 0) await database().from("picture_deletions").delete().eq("user_id", id);
  // A Plus row this run wrote must have gone with its user (ON DELETE CASCADE); if not, say so
  // loudly: the Mobile Dev removes it by exact id.
  const granted = grantedHere.get(email);
  if (granted) {
    grantedHere.delete(email);
    const { data, error } = await database().from("entitlements").select("user_id").eq("user_id", granted);
    if (error) throw new Error(`the entitlements check after cleanup failed: ${error.message}`);
    if ((data ?? []).length > 0) throw new Error(`an entitlements row was left for e2e user ${granted}: tell the Mobile Dev`);
  }
}

// Users a crashed run left behind (older than 2 h, so a parallel run's are safe).
export async function sweep(): Promise<number> {
  const cutoff = Date.now() - 2 * 3600_000;
  const stale: string[] = [];
  for await (const u of users()) if (ours(u.email) && Date.parse(u.created_at) < cutoff) stale.push(u.id);
  for (const id of stale) await admin().deleteUser(id);
  // UX's sweep check: no entitlements row may outlive the e2e users swept here.
  if (stale.length > 0 && (await plusOnStaging())) {
    const { data, error } = await database().from("entitlements").select("user_id").in("user_id", stale);
    if (error) throw new Error(`the entitlements sweep check failed: ${error.message}`);
    if ((data ?? []).length > 0) throw new Error(`entitlements rows were left for swept e2e users ${(data ?? []).map((r) => r.user_id).join(", ")}: tell the Mobile Dev`);
  }
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

// Moodbow Plus (decision 246): whether staging has 028's entitlements table yet. The Plus pages
// can't read it before then, so their journeys skip, saying so.
export async function plusOnStaging(): Promise<boolean> {
  if (!configured) return false;
  const { error } = await database().from("entitlements").select("user_id").limit(1);
  return !error;
}

// One of ours in the free week, as Checkout's webhook would leave it: a Stripe trial running for
// 7 days, with no store ids (so no cron or Stripe call ever touches it). It goes with the user.
// Staging only (the URL check above), never store ids or grace_until.
export async function grantPlusTrial(email: string): Promise<void> {
  if (!ours(email)) throw new Error("only e2e-ci-* users get Plus");
  if (!createdHere.has(email)) throw new Error("grantPlusTrial only writes for a user this run created");
  const id = await userId(email);
  if (!id) throw new Error("the signed-up user isn't on staging");
  const now = Date.now();
  const end = new Date(now + 7 * 86_400_000).toISOString();
  const { error } = await database()
    .from("entitlements")
    .upsert({ user_id: id, source: "stripe", status: "trialing", trial_started_at: new Date(now).toISOString(), trial_ends_at: end, current_period_end: end });
  if (error) throw new Error(`the trial row failed: ${error.message}`);
  grantedHere.set(email, id);
}
