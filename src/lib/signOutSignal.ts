// A deliberate sign-out tells this browser's other tabs (decision 81 as
// amended for the web, UX & PM 2026-11-03, option C): an editor still open
// there stops writing that user's draft. After "Delete it" it also drops
// what it holds; after "Keep it" (or when nothing was unsynced) it keeps it
// once, then stops. BroadcastChannel where the browser has it, else a
// storage event on a key that's written and removed at once.

export type SignOutMode = "keep" | "delete";
export type SignOutMessage = { uid: string; mode: SignOutMode };

const CHANNEL = "mb-sign-out";
// Not an mb:<kind>:<uid> key: it names no user in its key, and lives only
// for the moment it takes to fire the event.
export const SIGN_OUT_KEY = "mb:signed-out";

const hasChannel = () => typeof BroadcastChannel !== "undefined";

function parse(value: unknown): SignOutMessage | null {
  const m = value as Partial<SignOutMessage> | null;
  return m && typeof m.uid === "string" && (m.mode === "keep" || m.mode === "delete") ? { uid: m.uid, mode: m.mode } : null;
}

export function broadcastSignOut(message: SignOutMessage): void {
  if (hasChannel()) {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(message);
    channel.close();
    return;
  }
  try {
    window.localStorage.setItem(SIGN_OUT_KEY, JSON.stringify(message));
    window.localStorage.removeItem(SIGN_OUT_KEY);
  } catch {
    // storage unavailable: other tabs find out on their next request
  }
}

// Called for each sign-out in another tab; returns the unsubscribe.
export function onSignOut(handler: (message: SignOutMessage) => void): () => void {
  if (hasChannel()) {
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e: MessageEvent) => {
      const m = parse(e.data);
      if (m) handler(m);
    };
    return () => channel.close();
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SIGN_OUT_KEY || !e.newValue) return;
    try {
      const m = parse(JSON.parse(e.newValue));
      if (m) handler(m);
    } catch {
      // not ours
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
