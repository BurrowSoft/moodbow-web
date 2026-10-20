// Where focus should land after a keyboard shortcut (1.1 O): "c" goes to
// Today and lands on the check-in; "/" goes to the Timeline and opens its
// search. A one-time request in memory (never the URL or storage): the
// target takes it when it mounts, or at once if it's already on screen.
// A request nobody takes soon expires, so a later visit to that page never
// acts on a stale key press (reviewer #97).
export type Arrival = "checkIn" | "search";

// Long enough for a page to load and mount; short enough not to surprise.
export const ARRIVAL_TTL_MS = 10_000;

let pending: { kind: Arrival; at: number } | null = null;
const listeners = new Set<() => void>();

export function requestArrival(kind: Arrival) {
  pending = { kind, at: Date.now() };
  listeners.forEach((l) => l());
}

export function takeArrival(kind: Arrival): boolean {
  if (!pending) return false;
  const fresh = Date.now() - pending.at <= ARRIVAL_TTL_MS;
  if (fresh && pending.kind !== kind) return false;
  const yes = fresh && pending.kind === kind;
  pending = null;
  return yes;
}

// Runs `onArrive` for a request already waiting, and for any made while
// mounted. Returns the cleanup.
export function onArrival(kind: Arrival, onArrive: () => void): () => void {
  const check = () => {
    if (takeArrival(kind)) onArrive();
  };
  check();
  listeners.add(check);
  return () => {
    listeners.delete(check);
  };
}
