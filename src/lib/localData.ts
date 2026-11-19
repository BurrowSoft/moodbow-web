// Journal data kept in this browser (pending check-ins, drafts) lives under
// keys of the form mb:<kind>:<uid>[:<more>], always naming the user it
// belongs to, so one person's copies can be wiped without touching anyone
// else's on a shared browser (decisions 81 + 85).

export const localKey = (kind: string, uid: string, ...more: string[]) => ["mb", kind, uid, ...more].join(":");

export function wipeLocalData(storage: Storage, uid: string): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith("mb:") && key.split(":")[2] === uid) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

// This user's keys of the given kinds (mb:<kind>:<uid>…).
function keysOf(storage: Storage, uid: string, kinds: readonly string[]): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const parts = storage.key(i)?.split(":");
    if (parts && parts[0] === "mb" && parts[2] === uid && kinds.includes(parts[1])) keys.push(parts.join(":"));
  }
  return keys;
}

// What a deliberate web sign-out asks about (UX & PM 2026-11-03, option C,
// amending decision 81 for the web): writing not yet saved to the journal.
export const UNSYNCED_KINDS = ["draft-entry", "pending-checkin"] as const;
// Removed on every deliberate sign-out: a usage trace with no text worth
// keeping. milestone-seen stays (no text, and no re-offer of the card).
// lateNote (1.4 D): the night the late-night note last showed; on a shared browser it would tell
// the next person this user saved a low mood late (the Web Tester, #366).
export const SIGN_OUT_TRACE_KINDS = ["on-this-day-hidden", "toolbox-card-hidden", "letter-card-hidden", "lateNote"] as const;

export function hasLocalKinds(storage: Storage, uid: string, kinds: readonly string[]): boolean {
  return keysOf(storage, uid, kinds).length > 0;
}

export function wipeLocalKinds(storage: Storage, uid: string, kinds: readonly string[]): void {
  for (const key of keysOf(storage, uid, kinds)) storage.removeItem(key);
}

// With nobody signed in (the session ended, or the sign-in page): these kinds go for every user,
// since the server signed them out without this page knowing who (UX, #366).
export const NO_SESSION_TRACE_KINDS = ["lateNote"] as const;
export function wipeKindsForEveryone(storage: Storage, kinds: readonly string[]): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const parts = storage.key(i)?.split(":");
    if (parts && parts[0] === "mb" && kinds.includes(parts[1])) keys.push(parts.join(":"));
  }
  for (const key of keys) storage.removeItem(key);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The uid named by the proxy's mb_wipe cookie (lib/supabase/proxy.ts), if any.
export function wipeCookieUid(cookie: string): string | null {
  const value = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("mb_wipe="))
    ?.slice("mb_wipe=".length);
  return value && UUID.test(value) ? value : null;
}
