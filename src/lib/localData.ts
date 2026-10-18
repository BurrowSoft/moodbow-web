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
